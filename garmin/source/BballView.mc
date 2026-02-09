using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Timer;
using Toybox.Lang;
using Toybox.System;

class BballView extends WatchUi.View {
    // Game state from API
    var teamAScore as Lang.Number = 0;
    var teamBScore as Lang.Number = 0;
    var lastEvent as Lang.String = "";
    var gameStatus as Lang.String = "idle";
    var gameId as Lang.String? = null;
    var lastEventId as Lang.Number? = null;
    var lastEventPlayer as Lang.String? = null;
    var lastEventPoints as Lang.Number? = null;
    var teamANames as Lang.String = "";
    var teamBNames as Lang.String = "";
    var targetScore as Lang.Number = 0;

    // Polling
    var pollTimer as Timer.Timer?;
    var isLoading as Lang.Boolean = false;
    var lastError as Lang.String = "";
    var undoConfirm as Lang.Boolean = false;

    // Undo button touch zone
    var undoBtnY as Lang.Number = 160;
    var undoBtnHeight as Lang.Number = 40;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        // Start polling every 5 seconds
        pollTimer = new Timer.Timer();
        pollTimer.start(method(:onPoll), 3000, true);
        // Immediate first fetch
        BballService.fetchGameState(method(:onDataReceived));
    }

    function onHide() as Void {
        if (pollTimer != null) {
            pollTimer.stop();
            pollTimer = null;
        }
    }

    function onPoll() as Void {
        if (!isLoading) {
            isLoading = true;
            BballService.fetchGameState(method(:onDataReceived));
        }
    }

    function onDataReceived(responseCode as Lang.Number, data as Lang.Dictionary?) as Void {
        isLoading = false;
        if (responseCode == 200 && data != null) {
            teamAScore = (data["team_a_score"] != null) ? (data["team_a_score"] as Lang.Number) : 0;
            teamBScore = (data["team_b_score"] != null) ? (data["team_b_score"] as Lang.Number) : 0;
            lastEvent = (data["last_event"] != null) ? (data["last_event"] as Lang.String) : "";
            gameStatus = (data["game_status"] != null) ? (data["game_status"] as Lang.String) : "idle";
            gameId = data["game_id"] as Lang.String?;
            lastEventId = data["last_event_id"] as Lang.Number?;
            lastEventPlayer = data["last_event_player"] as Lang.String?;
            lastEventPoints = data["last_event_points"] as Lang.Number?;
            targetScore = (data["target_score"] != null) ? (data["target_score"] as Lang.Number) : 0;

            // Build name strings from arrays
            var aN = data["team_a_names"];
            var bN = data["team_b_names"];
            teamANames = (aN != null) ? joinArray(aN as Lang.Array) : "";
            teamBNames = (bN != null) ? joinArray(bN as Lang.Array) : "";
            lastError = "";
        } else if (responseCode == -104) {
            lastError = "No connection";
        } else {
            lastError = "Error " + responseCode;
        }
        WatchUi.requestUpdate();
    }

    function joinArray(arr as Lang.Array) as Lang.String {
        var result = "";
        for (var i = 0; i < arr.size(); i++) {
            if (i > 0) {
                result = result + ", ";
            }
            result = result + arr[i];
        }
        return result;
    }

    function formatTime() as Lang.String {
        var clock = System.getClockTime();
        var h = clock.hour;
        var m = clock.min;
        var ampm = "AM";
        if (h >= 12) { ampm = "PM"; }
        if (h > 12) { h = h - 12; }
        if (h == 0) { h = 12; }
        var mStr = m.toString();
        if (m < 10) { mStr = "0" + m.toString(); }
        return h.toString() + ":" + mStr + " " + ampm;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;

        if (gameStatus.equals("idle")) {
            drawIdleScreen(dc, cx, h);
            return;
        }

        // --- Time at top ---
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 14, Graphics.FONT_XTINY, formatTime(),
                    Graphics.TEXT_JUSTIFY_CENTER);

        // --- Team labels ---
        dc.setColor(0x6699FF, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - 50, 30, Graphics.FONT_XTINY, "TEAM A",
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(0xFF9933, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx + 50, 30, Graphics.FONT_XTINY, "TEAM B",
                    Graphics.TEXT_JUSTIFY_CENTER);

        // --- Large scores ---
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - 45, 50, Graphics.FONT_NUMBER_HOT, teamAScore.toString(),
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 62, Graphics.FONT_MEDIUM, "-",
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx + 45, 50, Graphics.FONT_NUMBER_HOT, teamBScore.toString(),
                    Graphics.TEXT_JUSTIFY_CENTER);

        // --- Last event ---
        if (!lastEvent.equals("")) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 120, Graphics.FONT_SMALL, lastEvent,
                        Graphics.TEXT_JUSTIFY_CENTER);
        }

        // --- Status line ---
        if (gameStatus.equals("active")) {
            var statusText = "LIVE";
            if (targetScore > 0) {
                statusText = "to " + targetScore + " | LIVE";
            }
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 150, Graphics.FONT_XTINY, statusText,
                        Graphics.TEXT_JUSTIFY_CENTER);
        } else if (gameStatus.equals("finished")) {
            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 150, Graphics.FONT_XTINY, "FINAL",
                        Graphics.TEXT_JUSTIFY_CENTER);
        }

        // --- Undo button at bottom (only during active game with events) ---
        if (gameStatus.equals("active") && lastEventId != null) {
            undoBtnY = 190;
            undoBtnHeight = 36;
            if (undoConfirm) {
                dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
                dc.drawText(cx, undoBtnY + 6, Graphics.FONT_SMALL,
                            "Undone!", Graphics.TEXT_JUSTIFY_CENTER);
            } else {
                dc.setColor(0x990000, 0x990000);
                dc.fillRoundedRectangle(cx - 45, undoBtnY, 90, undoBtnHeight, 8);
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(cx, undoBtnY + 6, Graphics.FONT_SMALL,
                            "UNDO", Graphics.TEXT_JUSTIFY_CENTER);
            }
        }

        // --- Error display ---
        if (!lastError.equals("")) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 230, Graphics.FONT_XTINY, lastError,
                        Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    function drawIdleScreen(dc as Graphics.Dc, cx as Lang.Number, h as Lang.Number) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 - 30, Graphics.FONT_MEDIUM, "BBall Stats",
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 + 10, Graphics.FONT_SMALL, "No active game",
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 + 40, Graphics.FONT_XTINY, "Polling...",
                    Graphics.TEXT_JUSTIFY_CENTER);
        if (!lastError.equals("")) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h / 2 + 60, Graphics.FONT_XTINY, lastError,
                        Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    function onUndoComplete(responseCode as Lang.Number, data as Lang.Dictionary?) as Void {
        if (responseCode == 200) {
            undoConfirm = true;
            // Refresh data immediately after undo
            BballService.fetchGameState(method(:onDataReceived));
            // Clear "Undone!" after 2 seconds
            var confirmTimer = new Timer.Timer();
            confirmTimer.start(method(:clearUndoConfirm), 2000, false);
        }
        WatchUi.requestUpdate();
    }

    function clearUndoConfirm() as Void {
        undoConfirm = false;
        WatchUi.requestUpdate();
    }
}
