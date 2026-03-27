export type HighlightTone = 'base' | 'holo' | 'ultra' | 'secret'

class PocketSfx {
  private context: AudioContext | null = null
  private muted = false

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

    oscillator.type = options.type || 'sine'
    oscillator.frequency.setValueAtTime(options.frequency, now)
    if (typeof options.frequencyEnd === 'number') {
      oscillator.frequency.exponentialRampToValueAtTime(options.frequencyEnd, now + options.duration)
    }

    const maxVolume = options.volume ?? 0.06
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(maxVolume, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration)

    oscillator.connect(gain)
    gain.connect(context.destination)

    oscillator.start(now)
    oscillator.stop(now + options.duration + 0.02)
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
    filter.frequency.value = options.highpass ?? 900

    const gain = context.createGain()
    const now = context.currentTime + (options.delay || 0)
    const maxVolume = options.volume ?? 0.05

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(maxVolume, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)

    source.start(now)
    source.stop(now + duration + 0.02)
  }

  tap() {
    this.playTone({ frequency: 640, frequencyEnd: 520, duration: 0.09, type: 'triangle', volume: 0.045 })
    this.playTone({ frequency: 980, frequencyEnd: 760, duration: 0.05, type: 'sine', volume: 0.018, delay: 0.015 })
  }

  rustle() {
    this.playNoise({ duration: 0.18, volume: 0.04, highpass: 1200 })
    this.playTone({ frequency: 240, frequencyEnd: 200, duration: 0.15, type: 'triangle', volume: 0.022, delay: 0.02 })
    this.playNoise({ duration: 0.11, volume: 0.022, highpass: 2800, delay: 0.06 })
  }

  ripCharge() {
    this.playNoise({ duration: 0.2, volume: 0.03, highpass: 1900 })
    this.playTone({ frequency: 210, frequencyEnd: 172, duration: 0.18, type: 'triangle', volume: 0.028 })
    this.playTone({ frequency: 520, frequencyEnd: 430, duration: 0.14, type: 'sine', volume: 0.014, delay: 0.04 })
    this.playNoise({ duration: 0.11, volume: 0.018, highpass: 3000, delay: 0.08 })
  }

  ripSnap() {
    this.playNoise({ duration: 0.07, volume: 0.055, highpass: 3600 })
    this.playTone({ frequency: 920, frequencyEnd: 580, duration: 0.09, type: 'triangle', volume: 0.022 })
    this.playTone({ frequency: 180, frequencyEnd: 120, duration: 0.12, type: 'sine', volume: 0.018, delay: 0.01 })
  }

  tear() {
    this.playNoise({ duration: 0.23, volume: 0.06, highpass: 1600 })
    this.playTone({ frequency: 300, frequencyEnd: 210, duration: 0.18, type: 'sawtooth', volume: 0.03 })
  }

  tearOpen() {
    this.playNoise({ duration: 0.08, volume: 0.05, highpass: 4000 })
    this.playTone({ frequency: 720, frequencyEnd: 540, duration: 0.09, type: 'triangle', volume: 0.024 })
    this.playNoise({ duration: 0.34, volume: 0.052, highpass: 2000 })
    this.playNoise({ duration: 0.22, volume: 0.036, highpass: 3400, delay: 0.09 })
    this.playTone({ frequency: 680, frequencyEnd: 360, duration: 0.3, type: 'sawtooth', volume: 0.027, delay: 0.02 })
    this.playTone({ frequency: 980, frequencyEnd: 560, duration: 0.19, type: 'triangle', volume: 0.02, delay: 0.11 })
    this.playTone({ frequency: 1420, frequencyEnd: 820, duration: 0.16, type: 'sine', volume: 0.015, delay: 0.16 })
  }

  packPop() {
    this.playTone({ frequency: 300, frequencyEnd: 130, duration: 0.14, type: 'triangle', volume: 0.024 })
    this.playNoise({ duration: 0.12, volume: 0.02, highpass: 1500, delay: 0.01 })
    this.playTone({ frequency: 560, frequencyEnd: 440, duration: 0.11, type: 'sine', volume: 0.015, delay: 0.04 })
  }

  whoosh() {
    this.playNoise({ duration: 0.14, volume: 0.03, highpass: 1400 })
    this.playTone({ frequency: 480, frequencyEnd: 260, duration: 0.17, type: 'triangle', volume: 0.032 })
    this.playNoise({ duration: 0.1, volume: 0.018, highpass: 2800, delay: 0.035 })
    this.playTone({ frequency: 760, frequencyEnd: 420, duration: 0.12, type: 'sine', volume: 0.012, delay: 0.02 })
  }

  flip() {
    this.playTone({ frequency: 780, frequencyEnd: 620, duration: 0.08, type: 'triangle', volume: 0.04 })
    this.playTone({ frequency: 1040, frequencyEnd: 880, duration: 0.06, type: 'sine', volume: 0.025, delay: 0.04 })
    this.playNoise({ duration: 0.05, volume: 0.012, highpass: 2600, delay: 0.015 })
  }

  rarity(tone: HighlightTone) {
    if (tone === 'base') return
    if (tone === 'holo') {
      this.playTone({ frequency: 660, duration: 0.1, type: 'sine', volume: 0.042 })
      this.playTone({ frequency: 880, duration: 0.16, type: 'sine', volume: 0.035, delay: 0.09 })
      this.playTone({ frequency: 1120, duration: 0.13, type: 'triangle', volume: 0.02, delay: 0.16 })
      return
    }
    if (tone === 'ultra') {
      this.playTone({ frequency: 700, duration: 0.1, type: 'sine', volume: 0.05 })
      this.playTone({ frequency: 930, duration: 0.12, type: 'sine', volume: 0.045, delay: 0.08 })
      this.playTone({ frequency: 1180, duration: 0.2, type: 'triangle', volume: 0.04, delay: 0.15 })
      this.playTone({ frequency: 1460, duration: 0.18, type: 'sine', volume: 0.026, delay: 0.22 })
      this.playNoise({ duration: 0.08, volume: 0.012, highpass: 3200, delay: 0.12 })
      return
    }
    this.playTone({ frequency: 760, duration: 0.11, type: 'sine', volume: 0.055 })
    this.playTone({ frequency: 1020, duration: 0.12, type: 'sine', volume: 0.05, delay: 0.08 })
    this.playTone({ frequency: 1360, duration: 0.28, type: 'triangle', volume: 0.048, delay: 0.16 })
    this.playTone({ frequency: 1720, duration: 0.3, type: 'sine', volume: 0.032, delay: 0.23 })
    this.playTone({ frequency: 2100, frequencyEnd: 1680, duration: 0.18, type: 'triangle', volume: 0.018, delay: 0.3 })
    this.playNoise({ duration: 0.14, volume: 0.014, highpass: 3600, delay: 0.06 })
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
