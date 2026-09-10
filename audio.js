(() => {
  'use strict';

  const SOUNDTRACKS = {
    forest: { name: '森林 · Carefree', beat: .86, voice: 'sine', decay: 2.3, wind: 650,
      melody: [72, null, 76, 79, 74, null, 76, null, 69, null, 72, 76, 74, null, 72, null], chords: [[48, 55, 64], [45, 52, 60]] },
    treehouse: { name: '树屋 · 木音小步舞', beat: .38, voice: 'triangle', decay: .32, wind: 420,
      melody: [74, 78, 81, null, 78, 74, 69, null, 71, 74, 78, null, 76, 73, 69, null, 67, 71, 74, null, 76, 74, 71, null, 69, 73, 76, 81, 78, 76, 74, null],
      chords: [[50, 57, 66], [47, 54, 62], [43, 50, 59], [45, 52, 61]] },
    clouds: { name: '云海 · 风铃长诗', beat: .92, voice: 'sine', decay: 3.2, wind: 1200,
      melody: [79, null, 86, null, 83, 81, null, null, 78, null, 81, null, 86, null, 83, null, 76, null, 79, 83, null, 86, null, null, 74, null, 81, null, 78, null, 79, null],
      chords: [[43, 50, 59], [50, 57, 66], [40, 47, 55], [48, 55, 62]] },
    castle: { name: '古堡 · 月下钟声', beat: .64, voice: 'sine', decay: 2.4, wind: 260,
      melody: [74, null, 81, 77, null, 76, 74, null, 70, null, 77, null, 81, 79, 77, null, 67, null, 74, 77, null, 79, 77, null, 69, null, 73, 76, 81, null, 73, null],
      chords: [[38, 45, 53], [34, 41, 50], [31, 38, 46], [33, 40, 49]] },
    palace: { name: '王宫 · 深海回响', beat: .72, voice: 'sine', decay: 2.8, wind: 180,
      melody: [76, null, 83, 78, null, 81, 78, null, 74, null, 81, 78, 76, null, 74, null, 71, 78, null, 83, 81, null, 78, null, 73, null, 80, 83, null, 78, 76, null],
      chords: [[40, 47, 54], [38, 45, 52], [35, 42, 50], [37, 44, 52]] }
  };

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
      this.scene = 'forest';
      this.soundtrack = SOUNDTRACKS.forest;
      this.scenicUntil = 0;
    }

    setScene(scene) {
      const nextScene = Object.hasOwn(SOUNDTRACKS, scene) ? scene : 'forest';
      if (nextScene === this.scene) return;
      this.releaseVoices();
      this.scene = nextScene;
      this.soundtrack = SOUNDTRACKS[nextScene];
      this.beat = 0;
      this.scenicUntil = 0;
      this.lastEffects.clear();
      if (this.context) {
        this.nextBeat = this.context.currentTime + .3;
        this.windFilter.frequency.setTargetAtTime(this.soundtrack.wind, this.context.currentTime, .8);
      }
      this.syncMusic();
      if (nextScene === 'forest') this.loadMusic();
      this.onMusicStatus?.();
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
      filter.frequency.value = this.soundtrack.wind;
      this.windFilter = filter;
      wind.connect(filter);
      filter.connect(this.buses.nature);
      wind.start();
      this.nextBeat = audio.currentTime + .12;
    }

    async loadMusic() {
      if (this.scene !== 'forest' || this.musicLoadStarted || !this.context) return;
      this.musicLoadStarted = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('assets/carefree.mp3', { signal: controller.signal });
        if (!response.ok) throw new Error('Music unavailable');
        this.musicBuffer = await this.context.decodeAudioData(await response.arrayBuffer());
        if (this.scene === 'forest') this.releaseVoices();
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
      const shouldPlay = this.scene === 'forest' && this.enabled && !this.paused && this.context.state === 'running';
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

    note(midi, when, duration, strength, category = 'music', endMidi = midi, waveform = 'sine') {
      if (!this.context || this.voices.size >= 48) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const frequency = value => 440 * 2 ** ((value - 69) / 12);
      oscillator.type = waveform;
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
      if (this.scene === 'forest' && this.musicBuffer) { this.syncMusic(); return; }
      if (!this.context || this.context.state !== 'running' || !this.enabled || this.paused) return;
      const now = this.context.currentTime;
      if (this.nextBeat < now - .2) this.nextBeat = now + .05;
      const { melody, chords, beat, decay, voice } = this.soundtrack;
      while (this.nextBeat < now + .22) {
        const position = this.beat % melody.length;
        const softness = now < this.scenicUntil ? .28 : 1;
        const pitch = melody[position];
        if (pitch !== null) {
          this.note(pitch, this.nextBeat, decay, .1 * softness, 'music', pitch, voice);
          if (this.scene === 'castle' || this.scene === 'clouds') {
            this.note(pitch + 19, this.nextBeat + .015, decay * .45, .018 * softness);
          }
        }
        if (position % 8 === 0) {
          chords[Math.floor(position / 8)].forEach((chordPitch, index) =>
            this.note(chordPitch, this.nextBeat + index * .09, beat * 7.5, .045 * softness));
        }
        if (this.scene === 'treehouse' && position % 2 === 0) {
          this.note(38, this.nextBeat, .07, .045 * softness, 'music', 31, 'triangle');
        }
        this.nextBeat += beat;
        this.beat += 1;
      }
    }

    updateEnvironment(world) {
      if (!['castle', 'palace'].includes(this.scene) || !this.context || this.paused || !this.enabled) return;
      const player = world.players[0];
      const nearbyJet = world.flameJets.find(jet => Math.abs(jet.x - player.x) < 210 && jet.warning);
      const nearbyFlame = world.flameJets.find(jet => Math.abs(jet.x - player.x) < 150 && jet.active);
      const nearbyBat = world.bats.find(bat => Math.abs(bat.x - player.x) < 120);
      const now = this.context.currentTime;
      for (const [type, present, interval] of [['flameWarning', nearbyJet, .7], ['flame', nearbyFlame, .9], ['wings', nearbyBat, .65]]) {
        if (present && now - (this.lastEffects.get(type) ?? -10) > interval) this.effect(type);
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
        scenic: [[50, 0, 3.5, .08], [74, .15, 2.2, .1], [81, .45, 2.4, .09], [86, .8, 2.8, .08], [89, 1.2, 2.6, .06]],
        meteor: [[86, 0, 1.1, .035, 74], [93, .08, .8, .02, 81]],
        constellation: [[74, 0, 1.8, .07], [77, .18, 2, .06], [81, .36, 2.4, .06]],
        flameWarning: [[81, 0, .13, .045], [81, .18, .13, .035]],
        flame: [[38, 0, .55, .065, 50]], wings: [[45, 0, .1, .03, 38], [48, .16, .09, .02, 40]],
        checkpoint: [[72, 0, .9, .11], [76, .18, .9, .1], [79, .36, 1.2, .09]],
        complete: [[72, 0, 1.2, .12], [76, .22, 1.2, .11], [79, .44, 1.4, .1], [84, .7, 1.8, .08]]
      };
      if (type === 'scenic') this.scenicUntil = now + 9;
      const sceneCues = {
        treehouse: { land: [[48, 0, .09, .08]], interact: [[62, 0, .12, .1], [69, .1, .16, .07]] },
        clouds: { jump: [[74, 0, .35, .09, 86]], land: [[67, 0, .3, .05]], gem: [[86, 0, 1.2, .09], [93, .16, 1.4, .05]] },
        palace: {
          jump: [[64, 0, .26, .085, 81]], land: [[45, 0, .25, .055, 40]],
          gem: [[83, 0, 1.2, .09], [90, .15, 1.4, .05]],
          interact: [[52, 0, .8, .08], [76, .18, 1, .055]],
          scenic: [[40, 0, 3.5, .07], [76, .2, 2.8, .08], [83, .65, 3, .06], [90, 1.1, 2.4, .04]],
          whale: [[45, 0, 2.6, .085, 52], [57, .5, 2.8, .035, 49]],
          flameWarning: [[76, 0, .18, .05, 83], [76, .24, .18, .04, 83]],
          flame: [[52, 0, .45, .055, 76], [64, .16, .3, .025, 81]]
        },
        castle: { land: [[38, 0, .15, .085], [57, .025, .22, .025]], interact: [[38, 0, .6, .08], [50, .12, .7, .06]], gem: [[81, 0, 1, .09], [86, .15, 1.3, .06]] }
      };
      const waveform = this.scene === 'treehouse' || type === 'flame' || type === 'wings' ? 'triangle' : 'sine';
      for (const [pitch, delay, duration, strength, endPitch] of sceneCues[this.scene]?.[type] || cues[type] || []) {
        this.note(pitch, now + delay, duration, strength, 'effects', endPitch ?? pitch, waveform);
      }
    }
  }

  window.CozyAudio = CozyAudio;
})();
