import ExpoModulesCore
import AVFoundation

public class AudioStreamModule: Module {
  private let audioEngine = AVAudioEngine()
  private var isRunning = false

  public func definition() -> ModuleDefinition {
    Name("AudioStream")

    Events("onAudioData")

    AsyncFunction("start") { (sampleRate: Int) in
      guard !self.isRunning else { return }

      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setActive(true)

      let inputNode = self.audioEngine.inputNode
      let hwFormat = inputNode.outputFormat(forBus: 0)

      // Target format: mono PCM Int16 at requested sample rate
      guard let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(sampleRate),
        channels: 1,
        interleaved: true
      ) else {
        throw NSError(domain: "AudioStream", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create target audio format"])
      }

      // Converter from hardware format to target format
      guard let converter = AVAudioConverter(from: hwFormat, to: targetFormat) else {
        throw NSError(domain: "AudioStream", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create audio converter"])
      }

      // Install tap on input node
      inputNode.installTap(onBus: 0, bufferSize: 4096, format: hwFormat) { [weak self] (buffer, _) in
        guard let self = self else { return }

        // Calculate output frame count based on sample rate ratio
        let ratio = targetFormat.sampleRate / hwFormat.sampleRate
        let outputFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)

        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outputFrameCount) else { return }

        var error: NSError?
        let status = converter.convert(to: outputBuffer, error: &error) { _, outStatus in
          outStatus.pointee = .haveData
          return buffer
        }

        guard status != .error, error == nil else { return }

        // Convert Int16 samples to base64
        let data = Data(
          bytes: outputBuffer.int16ChannelData![0],
          count: Int(outputBuffer.frameLength) * 2
        )
        let base64 = data.base64EncodedString()

        self.sendEvent("onAudioData", [
          "data": base64
        ])
      }

      try self.audioEngine.start()
      self.isRunning = true
    }

    Function("stop") {
      guard self.isRunning else { return }
      self.audioEngine.inputNode.removeTap(onBus: 0)
      self.audioEngine.stop()
      self.isRunning = false
    }
  }
}
