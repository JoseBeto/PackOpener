export type HighlightTone = 'base' | 'holo' | 'ultra' | 'secret'

class PocketSfx {
  private context: AudioContext | null = null
  private muted = false
  private masterGain: GainNode | null = null
  private masterCompressor: DynamicsCompressorNode | null = null

  setMuted(value: boolean) {
    this.muted = value
  }

  private getContext() {
    if (typeof window === 'undefined') return null
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return null
    if (!this.context) {
      this.context = new AudioContextCtor()
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => undefined)
    }
    return this.context
  }

  private getOutputNode(context: AudioContext) {
    if (!this.masterGain || !this.masterCompressor) {
      this.masterCompressor = context.createDynamicsCompressor()
      this.masterCompressor.threshold.value = -21
      this.masterCompressor.knee.value = 22
      this.masterCompressor.ratio.value = 3.1
      this.masterCompressor.attack.value = 0.004
      this.masterCompressor.release.value = 0.15

      this.masterGain = context.createGain()
      this.masterGain.gain.value = 0.76

      this.masterCompressor.connect(this.masterGain)
      this.masterGain.connect(context.destination)
    }
    return this.masterCompressor
  }

  private variance(amount: number) {
    return 1 + (Math.random() * 2 - 1) * amount
  }

  unlock() {
    this.getContext()
  }

  private playTone(options: {
    frequency: number
    duration: number
    type?: OscillatorType
    volume?: number
    frequencyEnd?: number
    delay?: number
  }) {
    if (this.muted) return
    const context = this.getContext()
    if (!context) return

    const now = context.currentTime + (options.delay || 0)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const output = this.getOutputNode(context)

    oscillator.type = options.type || 'sine'
    const jitteredFrequency = Math.max(40, options.frequency * this.variance(0.015))
    oscillator.frequency.setValueAtTime(jitteredFrequency, now)
    if (typeof options.frequencyEnd === 'number') {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, options.frequencyEnd * this.variance(0.015)), now + options.duration)
    }

    const maxVolume = (options.volume ?? 0.06) * this.variance(0.08)
    const duration = Math.max(0.03, options.duration * this.variance(0.06))
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(maxVolume, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    oscillator.connect(gain)
    gain.connect(output)

    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  }

  private playNoise(options: { duration: number; volume?: number; delay?: number; highpass?: number }) {
    if (this.muted) return
    const context = this.getContext()
    if (!context) return

    const duration = options.duration
    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration))
    const noiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate)
    const channelData = noiseBuffer.getChannelData(0)

    for (let index = 0; index < sampleCount; index += 1) {
      channelData[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount)
    }

    const source = context.createBufferSource()
    source.buffer = noiseBuffer

    const filter = context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = (options.highpass ?? 900) * this.variance(0.04)

    const gain = context.createGain()
    const output = this.getOutputNode(context)
    const now = context.currentTime + (options.delay || 0)
    const maxVolume = (options.volume ?? 0.05) * this.variance(0.09)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(maxVolume, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(output)

    source.start(now)
    source.stop(now + duration + 0.02)
  }

  tap() {
    this.playTone({ frequency: 640, frequencyEnd: 520, duration: 0.09, type: 'triangle', volume: 0.045 })
    this.playTone({ frequency: 980, frequencyEnd: 760, duration: 0.05, type: 'sine', volume: 0.018, delay: 0.015 })
  }

  rustle() {
    this.playNoise({ duration: 0.16, volume: 0.03, highpass: 1100 })
    this.playTone({ frequency: 236, frequencyEnd: 192, duration: 0.13, type: 'triangle', volume: 0.017, delay: 0.018 })
    this.playNoise({ duration: 0.1, volume: 0.016, highpass: 2500, delay: 0.05 })
  }

  ripCharge(intensity = 0.65) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playNoise({ duration: 0.14 + power * 0.08, volume: 0.015 + power * 0.01, highpass: 1600 + power * 700 })
    this.playTone({ frequency: 184 + power * 42, frequencyEnd: 148 + power * 30, duration: 0.14 + power * 0.06, type: 'triangle', volume: 0.013 + power * 0.009 })
    this.playNoise({ duration: 0.07 + power * 0.05, volume: 0.007 + power * 0.007, highpass: 2200 + power * 600, delay: 0.065 })
  }

  ripSnap(intensity = 0.7) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playNoise({ duration: 0.05 + power * 0.04, volume: 0.017 + power * 0.014, highpass: 2500 + power * 900 })
    this.playTone({ frequency: 680 + power * 180, frequencyEnd: 420 + power * 110, duration: 0.06 + power * 0.05, type: 'triangle', volume: 0.009 + power * 0.008 })
    this.playTone({ frequency: 150 + power * 34, frequencyEnd: 94 + power * 24, duration: 0.09 + power * 0.06, type: 'sine', volume: 0.007 + power * 0.007, delay: 0.01 })
  }

  ripDrag(intensity = 0.5) {
    const power = Math.max(0.15, Math.min(1, intensity))
    this.playNoise({ duration: 0.04 + power * 0.03, volume: 0.008 + power * 0.009, highpass: 1600 + power * 700 })
    this.playTone({ frequency: 460 - power * 70, frequencyEnd: 330 - power * 56, duration: 0.045 + power * 0.028, type: 'triangle', volume: 0.003 + power * 0.005 })
  }

  ripStretch(intensity = 0.7) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playNoise({ duration: 0.09 + power * 0.08, volume: 0.014 + power * 0.016, highpass: 1500 + power * 700 })
    this.playTone({ frequency: 340 + power * 80, frequencyEnd: 198 + power * 34, duration: 0.09 + power * 0.06, type: 'sawtooth', volume: 0.008 + power * 0.012 })
  }

  tear() {
    this.playNoise({ duration: 0.23, volume: 0.06, highpass: 1600 })
    this.playTone({ frequency: 300, frequencyEnd: 210, duration: 0.18, type: 'sawtooth', volume: 0.03 })
  }

  tearOpen(intensity = 0.75) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playNoise({ duration: 0.06 + power * 0.05, volume: 0.019 + power * 0.016, highpass: 2700 + power * 700 })
    this.playTone({ frequency: 560 + power * 140, frequencyEnd: 370 + power * 120, duration: 0.07 + power * 0.06, type: 'triangle', volume: 0.009 + power * 0.008 })
    this.playNoise({ duration: 0.18 + power * 0.16, volume: 0.015 + power * 0.018, highpass: 1450 + power * 600, delay: 0.015 })
    this.playTone({ frequency: 460 + power * 140, frequencyEnd: 240 + power * 110, duration: 0.16 + power * 0.12, type: 'sawtooth', volume: 0.009 + power * 0.01, delay: 0.03 })
  }

  packPop(intensity = 0.65) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playTone({ frequency: 280 + power * 60, frequencyEnd: 120 + power * 30, duration: 0.1 + power * 0.08, type: 'triangle', volume: 0.014 + power * 0.016 })
    this.playNoise({ duration: 0.08 + power * 0.08, volume: 0.012 + power * 0.016, highpass: 1300 + power * 700, delay: 0.01 })
    this.playTone({ frequency: 480 + power * 160, frequencyEnd: 360 + power * 100, duration: 0.08 + power * 0.08, type: 'sine', volume: 0.01 + power * 0.012, delay: 0.04 })
  }

  packOpenAccent(tone: HighlightTone) {
    if (tone === 'base') {
      this.playTone({ frequency: 360, frequencyEnd: 300, duration: 0.11, type: 'triangle', volume: 0.012, delay: 0.04 })
      return
    }
    if (tone === 'holo') {
      this.playTone({ frequency: 420, duration: 0.12, type: 'sine', volume: 0.016, delay: 0.03 })
      this.playTone({ frequency: 620, duration: 0.14, type: 'triangle', volume: 0.014, delay: 0.08 })
      return
    }
    if (tone === 'ultra') {
      this.playTone({ frequency: 380, duration: 0.16, type: 'sawtooth', volume: 0.02, delay: 0.03 })
      this.playTone({ frequency: 660, duration: 0.18, type: 'triangle', volume: 0.018, delay: 0.08 })
      this.playTone({ frequency: 940, duration: 0.16, type: 'sine', volume: 0.014, delay: 0.14 })
      return
    }
    this.playTone({ frequency: 340, duration: 0.18, type: 'sawtooth', volume: 0.024, delay: 0.02 })
    this.playTone({ frequency: 620, duration: 0.2, type: 'triangle', volume: 0.02, delay: 0.07 })
    this.playTone({ frequency: 980, duration: 0.24, type: 'sine', volume: 0.016, delay: 0.14 })
    this.playNoise({ duration: 0.14, volume: 0.012, highpass: 2800, delay: 0.09 })
  }

  whoosh() {
    this.playNoise({ duration: 0.12, volume: 0.018, highpass: 1200 })
    this.playTone({ frequency: 440, frequencyEnd: 240, duration: 0.15, type: 'triangle', volume: 0.018 })
    this.playTone({ frequency: 660, frequencyEnd: 370, duration: 0.1, type: 'sine', volume: 0.006, delay: 0.02 })
  }

  drawSlide(intensity = 0.5) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playNoise({ duration: 0.1 + power * 0.07, volume: 0.014 + power * 0.014, highpass: 1500 + power * 700 })
    this.playTone({ frequency: 410 + power * 110, frequencyEnd: 240 + power * 70, duration: 0.12 + power * 0.06, type: 'triangle', volume: 0.012 + power * 0.01 })
    this.playTone({ frequency: 920 - power * 160, frequencyEnd: 560 - power * 100, duration: 0.08 + power * 0.05, type: 'sine', volume: 0.007 + power * 0.006, delay: 0.02 })
  }

  cardLand(intensity = 0.6) {
    const power = Math.max(0.2, Math.min(1, intensity))
    this.playTone({ frequency: 260 - power * 40, frequencyEnd: 132 - power * 20, duration: 0.1 + power * 0.05, type: 'triangle', volume: 0.015 + power * 0.012 })
    this.playNoise({ duration: 0.07 + power * 0.05, volume: 0.009 + power * 0.01, highpass: 1300 + power * 500, delay: 0.01 })
  }

  hitRumble(tone: HighlightTone) {
    if (tone === 'base') return
    if (tone === 'holo') {
      this.playNoise({ duration: 0.1, volume: 0.009, highpass: 1800 })
      this.playTone({ frequency: 360, frequencyEnd: 230, duration: 0.17, type: 'triangle', volume: 0.012 })
      return
    }
    if (tone === 'ultra') {
      this.playTone({ frequency: 200, frequencyEnd: 116, duration: 0.24, type: 'sawtooth', volume: 0.017 })
      this.playNoise({ duration: 0.16, volume: 0.012, highpass: 1600, delay: 0.03 })
      this.playTone({ frequency: 590, frequencyEnd: 390, duration: 0.16, type: 'triangle', volume: 0.011, delay: 0.05 })
      return
    }
    this.playTone({ frequency: 184, frequencyEnd: 102, duration: 0.32, type: 'sawtooth', volume: 0.02 })
    this.playNoise({ duration: 0.2, volume: 0.014, highpass: 1450, delay: 0.02 })
    this.playTone({ frequency: 640, frequencyEnd: 340, duration: 0.2, type: 'triangle', volume: 0.013, delay: 0.06 })
  }

  flip() {
    this.playTone({ frequency: 780, frequencyEnd: 620, duration: 0.08, type: 'triangle', volume: 0.04 })
    this.playTone({ frequency: 1040, frequencyEnd: 880, duration: 0.06, type: 'sine', volume: 0.025, delay: 0.04 })
    this.playNoise({ duration: 0.05, volume: 0.012, highpass: 2600, delay: 0.015 })
  }

  rarity(tone: HighlightTone) {
    if (tone === 'base') return
    if (tone === 'holo') {
      this.playTone({ frequency: 640, duration: 0.1, type: 'sine', volume: 0.03 })
      this.playTone({ frequency: 850, duration: 0.15, type: 'sine', volume: 0.025, delay: 0.09 })
      this.playTone({ frequency: 1080, duration: 0.12, type: 'triangle', volume: 0.014, delay: 0.16 })
      return
    }
    if (tone === 'ultra') {
      this.playTone({ frequency: 680, duration: 0.1, type: 'sine', volume: 0.034 })
      this.playTone({ frequency: 900, duration: 0.12, type: 'sine', volume: 0.03, delay: 0.08 })
      this.playTone({ frequency: 1140, duration: 0.2, type: 'triangle', volume: 0.027, delay: 0.15 })
      this.playTone({ frequency: 1380, duration: 0.17, type: 'sine', volume: 0.018, delay: 0.22 })
      this.playNoise({ duration: 0.08, volume: 0.008, highpass: 3000, delay: 0.12 })
      return
    }
    this.playTone({ frequency: 730, duration: 0.11, type: 'sine', volume: 0.038 })
    this.playTone({ frequency: 980, duration: 0.12, type: 'sine', volume: 0.034, delay: 0.08 })
    this.playTone({ frequency: 1300, duration: 0.27, type: 'triangle', volume: 0.032, delay: 0.16 })
    this.playTone({ frequency: 1640, duration: 0.28, type: 'sine', volume: 0.021, delay: 0.23 })
    this.playTone({ frequency: 1980, frequencyEnd: 1580, duration: 0.17, type: 'triangle', volume: 0.012, delay: 0.3 })
    this.playNoise({ duration: 0.14, volume: 0.01, highpass: 3300, delay: 0.06 })
  }

  hitStinger(tone: HighlightTone) {
    if (tone !== 'ultra' && tone !== 'secret') return
    if (tone === 'ultra') {
      this.playTone({ frequency: 430, duration: 0.16, type: 'sawtooth', volume: 0.019 })
      this.playTone({ frequency: 700, duration: 0.2, type: 'triangle', volume: 0.024, delay: 0.06 })
      this.playTone({ frequency: 930, duration: 0.17, type: 'sine', volume: 0.018, delay: 0.12 })
      this.playNoise({ duration: 0.16, volume: 0.011, highpass: 2300, delay: 0.04 })
      return
    }
    this.playTone({ frequency: 360, duration: 0.2, type: 'sawtooth', volume: 0.022 })
    this.playTone({ frequency: 590, duration: 0.24, type: 'triangle', volume: 0.029, delay: 0.05 })
    this.playTone({ frequency: 880, duration: 0.26, type: 'sine', volume: 0.023, delay: 0.11 })
    this.playTone({ frequency: 1180, duration: 0.22, type: 'triangle', volume: 0.015, delay: 0.17 })
    this.playNoise({ duration: 0.2, volume: 0.013, highpass: 2200, delay: 0.05 })
  }

  summary() {
    this.playTone({ frequency: 420, duration: 0.1, type: 'triangle', volume: 0.04 })
    this.playTone({ frequency: 560, duration: 0.12, type: 'triangle', volume: 0.038, delay: 0.08 })
    this.playTone({ frequency: 700, duration: 0.22, type: 'sine', volume: 0.035, delay: 0.16 })
    this.playTone({ frequency: 920, duration: 0.26, type: 'sine', volume: 0.024, delay: 0.22 })
  }
}

let singleton: PocketSfx | null = null

export function getSfxEngine() {
  if (!singleton) singleton = new PocketSfx()
  return singleton
}
