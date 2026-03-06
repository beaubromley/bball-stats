import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioStreamPlugin())
        UIApplication.shared.isIdleTimerDisabled = true

        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(self, action: #selector(handleRefresh(_:)), for: .valueChanged)
        webView?.scrollView.refreshControl = refreshControl
    }

    @objc func handleRefresh(_ sender: UIRefreshControl) {
        webView?.reload()
        sender.endRefreshing()
    }
}
