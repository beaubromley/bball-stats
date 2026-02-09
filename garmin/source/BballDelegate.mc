using Toybox.WatchUi;
using Toybox.System;
using Toybox.Lang;

class BballDelegate extends WatchUi.BehaviorDelegate {
    var view as BballView;

    function initialize(v as BballView) {
        BehaviorDelegate.initialize();
        view = v;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Lang.Boolean {
        var coords = clickEvent.getCoordinates();
        var y = coords[1];

        // Check if tap is within undo button bounds
        if (view.gameStatus.equals("active") &&
            view.lastEventId != null &&
            !view.undoConfirm &&
            y >= view.undoBtnY &&
            y <= view.undoBtnY + view.undoBtnHeight) {
            BballService.sendUndo(method(:onUndoCallback));
            return true;
        }
        return false;
    }

    function onUndoCallback(responseCode as Lang.Number, data as Lang.Dictionary?) as Void {
        view.onUndoComplete(responseCode, data);
    }

    function onBack() as Lang.Boolean {
        return false;
    }
}
