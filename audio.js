(() => {
  'use strict';

  class CozyAudio {
    constructor() {
      this.context = null;
      this.enabled = true;
      this.paused = true;
      this.volumes = { music: .38, effects: .42, nature: .2 };
      this.nextBeat = 0;
      this.beat = 0;
      this.voices = new Set();
      this.lastEffects = new Map();
      this.onError = () => {};
      this.musicBuffer = null;
      this.musicSource = null;
      this.musicOffset = 0;
      this.musicStartedAt = 0;
      this.musicLoadStarted = false;
      this.musicFailed = false;
    }

    async unlock() {
      if (!this.enabled) return;
      try {
        if (!this.context) this.createGraph();
        if (this.context.state === 'suspended') await this.context.resume();
        if (this.context.state !== 'running') throw new Error('Audio is not running');
        this.applyVolumes();
        this.loadMusic();
        this.syncMusic();
      } catch {
        this.enabled = false;
        this.applyVolumes();
        this.onError();
      }
    }

    createGraph() {
      const AudioConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioConstructor) throw new Error('Web Audio is unavailable');
      this.context = new AudioConstructor();
      const audio = this.context;
      this.master = audio.createGain();
      this.master.gain.value = 0;
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 18;
      limiter.ratio.value = 4;
      this.master.connect(limiter);
      limiter.connect(audio.destination);
      this.buses = {};
      for (const category of Object.keys(this.volumes)) {
        const bus = audio.createGain();
        bus.gain.value = this.volumes[category];
        bus.connect(this.master);
        this.buses[category] = bus;
      }
      const echo = audio.createDelay(1);
      const echoGain = audio.createGain();
      echo.delayTime.value = .31;
      echoGain.gain.value = .13;
      this.buses.music.connect(echo);
      echo.connect(echoGain);
      echoGain.connect(this.master);
      // A filtered seamless noise loop sits well below the melody, without sharp bird calls.
      const noise = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
      const samples = noise.getChannelData(0);
      let previous = 0;
      for (let index = 0; index < samples.length; index += 1) {
        previous = .98 * previous + (Math.random() * 2 - 1) * .02;
        const edgeFade = Math.min(1, index / (audio.sampleRate * .08), (samples.length - 1 - index) / (audio.sampleRate * .08));
        samples[index] = previous * .5 * edgeFade;
      }
      const wind = audio.createBufferSource();
      wind.buffer = noise;
      wind.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      wind.connect(filter);
      filter.connect(this.buses.nature);
      wind.start();
      this.nextBeat = audio.currentTime + .12;
    }

    async loadMusic() {
      if (this.musicLoadStarted || !this.context) return;
      this.musicLoadStarted = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('assets/carefree.mp3', { signal: controller.signal });
        if (!response.ok) throw new Error('Music unavailable');
        this.musicBuffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.releaseVoices();
        this.syncMusic();
      } catch {
        this.musicFailed = true;
      } finally {
        clearTimeout(timeout);
        this.onMusicStatus?.(this.musicFailed);
      }
    }

    syncMusic() {
      if (!this.context || !this.musicBuffer) return;
      const shouldPlay = this.enabled && !this.paused && this.context.state === 'running';
      if (!shouldPlay && this.musicSource) {
        this.musicOffset = (this.musicOffset + this.context.currentTime - this.musicStartedAt) % this.musicBuffer.duration;
        this.musicSource.stop();
        this.musicSource.disconnect();
        this.musicSource = null;
      } else if (shouldPlay && !this.musicSource) {
        const source = this.context.createBufferSource();
        source.buffer = this.musicBuffer;
        source.loop = true;
        source.connect(this.buses.music);
        source.start(0, this.musicOffset);
        this.musicSource = source;
        this.musicStartedAt = this.context.currentTime;
      }
    }

    applyVolumes() {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.enabled && !this.paused ? .65 : 0, now, .15);
      this.syncMusic();
      for (const [category, volume] of Object.entries(this.volumes)) {
        this.buses[category].gain.setTargetAtTime(volume, now, .1);
      }
    }

    setPaused(paused) {
      if (this.paused === paused) return;
      this.paused = paused;
      if (this.context) {
        this.nextBeat = this.context.currentTime + .12;
        if (paused) this.releaseVoices();
      }
      this.applyVolumes();
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.releaseVoices();
      if (this.context) this.nextBeat = this.context.currentTime + .12;
      this.applyVolumes();
    }

    setVolume(category, value) {
      if (!(category in this.volumes) || !Number.isFinite(value)) return;
      this.volumes[category] = Math.max(0, Math.min(1, value));
      this.applyVolumes();
    }

    releaseVoices() {
      if (!this.context) return;
      const now = this.context.currentTime;
      for (const voice of this.voices) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, .06);
        voice.oscillator.stop(now + .3);
      }
    }

    note(midi, when, duration, strength, category = 'music', endMidi = midi) {
      if (!this.context || this.voices.size >= 48) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const frequency = value => 440 * 2 ** ((value - 69) / 12);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency(midi), when);
      if (endMidi !== midi) oscillator.frequency.exponentialRampToValueAtTime(frequency(endMidi), when + duration * .65);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(strength, when + Math.min(.055, duration * .18));
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      oscillator.connect(gain);
      gain.connect(this.buses[category]);
      const voice = { oscillator, gain };
      this.voices.add(voice);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      oscillator.start(when);
      oscillator.stop(when + duration + .03);
    }

    tick() {
      if (this.musicBuffer) { this.syncMusic(); return; }
      if (!this.context || this.context.state !== 'running' || !this.enabled || this.paused) return;
      const now = this.context.currentTime;
      if (this.nextBeat < now - .2) this.nextBeat = now + .05;
      // Slow C-major/add9 phrases: sparse melody, no drums, and no abrupt loop boundary.
      const melody = [72, null, 76, 79, 74, null, 76, null, 69, null, 72, 76, 74, null, 72, null,
        65, null, 69, 72, 76, null, 74, null, 67, null, 74, 79, 76, 74, 72, null];
      const chords = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]];
      while (this.nextBeat < now + .22) {
        const position = this.beat % melody.length;
        if (melody[position] !== null) this.note(melody[position], this.nextBeat, 2.3, .11);
        if (position % 8 === 0) {
          chords[Math.floor(position / 8)].forEach((pitch, index) => this.note(pitch, this.nextBeat + index * .06, 5.2, .055));
        }
        this.nextBeat += .86;
        this.beat += 1;
      }
    }

    effect(type) {
      if (!this.context || this.context.state !== 'running' || !this.enabled || this.paused) return;
      const now = this.context.currentTime;
      if (now - (this.lastEffects.get(type) ?? -10) < .09) return;
      this.lastEffects.set(type, now);
      const cues = {
        jump: [[67, 0, .23, .13, 74]], land: [[43, 0, .17, .09]],
        gem: [[79, 0, .65, .13], [84, .09, .8, .09]],
        interact: [[60, 0, .24, .13], [67, .07, .28, .08]],
        spring: [[60, 0, .42, .12, 79]], respawn: [[64, 0, .7, .07], [60, .12, .8, .06]],
        checkpoint: [[72, 0, .9, .11], [76, .18, .9, .1], [79, .36, 1.2, .09]],
        complete: [[72, 0, 1.2, .12], [76, .22, 1.2, .11], [79, .44, 1.4, .1], [84, .7, 1.8, .08]]
      };
      for (const [pitch, delay, duration, strength, endPitch] of cues[type] || []) {
        this.note(pitch, now + delay, duration, strength, 'effects', endPitch ?? pitch);
      }
    }
  }

  window.CozyAudio = CozyAudio;
})();
