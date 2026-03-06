import Capacitor
import AVFoundation

@objc(AudioStreamPlugin)
public class AudioStreamPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioStreamPlugin"
    public let jsName = "AudioStream"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var isRunning = false

    @objc func start(_ call: CAPPluginCall) {
        guard !isRunning else {
            call.resolve()
            return
        }

        let sampleRate = call.getInt("sampleRate") ?? 16000

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)

            let inputNode = audioEngine.inputNode
            let hwFormat = inputNode.outputFormat(forBus: 0)

            guard let targetFormat = AVAudioFormat(
                commonFormat: .pcmFormatInt16,
                sampleRate: Double(sampleRate),
                channels: 1,
                interleaved: true
            ) else {
                call.reject("Failed to create target audio format")
                return
            }

            guard let converter = AVAudioConverter(from: hwFormat, to: targetFormat) else {
                call.reject("Failed to create audio converter")
                return
            }

            inputNode.installTap(onBus: 0, bufferSize: 4096, format: hwFormat) { [weak self] (buffer, _) in
                guard let self = self else { return }

                let ratio = targetFormat.sampleRate / hwFormat.sampleRate
                let outputFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)

                guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outputFrameCount) else { return }

                var error: NSError?
                let status = converter.convert(to: outputBuffer, error: &error) { _, outStatus in
                    outStatus.pointee = .haveData
                    return buffer
                }

                guard status != .error, error == nil else { return }

                let data = Data(
                    bytes: outputBuffer.int16ChannelData![0],
                    count: Int(outputBuffer.frameLength) * 2
                )
                let base64 = data.base64EncodedString()

                self.notifyListeners("onAudioData", data: [
                    "data": base64
                ])
            }

            try audioEngine.start()
            isRunning = true
            call.resolve()
        } catch {
            call.reject("Failed to start audio: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard isRunning else {
            call.resolve()
            return
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        isRunning = false
        call.resolve()
    }
}
