using Toybox.Application;
using Toybox.Lang;
using Toybox.WatchUi;

class BballApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Lang.Dictionary?) as Void {
    }

    function onStop(state as Lang.Dictionary?) as Void {
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new BballView();
        var delegate = new BballDelegate(view);
        return [view, delegate];
    }
}
