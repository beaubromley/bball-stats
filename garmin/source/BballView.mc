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
    var failedTranscript as Lang.String = "";
    var liveTranscript as Lang.String = "";

    // Recent events feed (last 3 labels)
    var recentEvent1 as Lang.String = "";
    var recentEvent2 as Lang.String = "";
    var recentEvent3 as Lang.String = "";
    var recentEventType1 as Lang.String = "";
    var recentEventType2 as Lang.String = "";
    var recentEventType3 as Lang.String = "";

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
        pollTimer = new Timer.Timer();
        pollTimer.start(method(:onPoll), 1000, true);
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

            // Parse failed transcript
            var ft = data["last_failed_transcript"];
            if (ft != null) {
                var ftStr = ft as Lang.String;
                if (ftStr.length() > 30) {
                    ftStr = ftStr.substring(0, 30) + "...";
                }
                failedTranscript = ftStr;
            } else {
                failedTranscript = "";
            }

            // Parse live transcript
            var lt = data["live_transcript"];
            if (lt != null) {
                var ltStr = lt as Lang.String;
                if (ltStr.length() > 35) {
                    ltStr = ltStr.substring(0, 35) + "...";
                }
                liveTranscript = ltStr;
            } else {
                liveTranscript = "";
            }

            // Parse recent events (last 3 from the array)
            recentEvent1 = "";
            recentEvent2 = "";
            recentEvent3 = "";
            recentEventType1 = "";
            recentEventType2 = "";
            recentEventType3 = "";
            var re = data["recent_events"];
            if (re != null) {
                var events = re as Lang.Array;
                var size = events.size();
                // Take last 3 events (array is chronological, newest at end)
                if (size >= 1) {
                    var e1 = events[size - 1] as Lang.Dictionary;
                    recentEvent1 = (e1["label"] != null) ? (e1["label"] as Lang.String) : "";
                    recentEventType1 = (e1["type"] != null) ? (e1["type"] as Lang.String) : "";
                }
                if (size >= 2) {
                    var e2 = events[size - 2] as Lang.Dictionary;
                    recentEvent2 = (e2["label"] != null) ? (e2["label"] as Lang.String) : "";
                    recentEventType2 = (e2["type"] != null) ? (e2["type"] as Lang.String) : "";
                }
                if (size >= 3) {
                    var e3 = events[size - 3] as Lang.Dictionary;
                    recentEvent3 = (e3["label"] != null) ? (e3["label"] as Lang.String) : "";
                    recentEventType3 = (e3["type"] != null) ? (e3["type"] as Lang.String) : "";
                }
            }

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

    function getEventColor(eventType as Lang.String) as Lang.Number {
        if (eventType.equals("score")) { return Graphics.COLOR_GREEN; }
        if (eventType.equals("steal")) { return Graphics.COLOR_YELLOW; }
        if (eventType.equals("block")) { return Graphics.COLOR_PURPLE; }
        if (eventType.equals("assist")) { return 0x6699FF; }
        if (eventType.equals("correction")) { return Graphics.COLOR_RED; }
        return Graphics.COLOR_LT_GRAY;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var w = dc.getWidth();
        var cx = w / 2;

        if (gameStatus.equals("idle")) {
            drawIdleScreen(dc, cx, dc.getHeight());
            return;
        }

        // --- Row 1: Time + Status ---
        var timeStr = formatTime();
        if (gameStatus.equals("active")) {
            var statusSuffix = " | LIVE";
            if (targetScore > 0) {
                statusSuffix = " | to " + targetScore;
            }
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx - 30, 8, Graphics.FONT_XTINY, timeStr,
                        Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx + 45, 8, Graphics.FONT_XTINY, statusSuffix,
                        Graphics.TEXT_JUSTIFY_CENTER);
        } else if (gameStatus.equals("finished")) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx - 30, 8, Graphics.FONT_XTINY, timeStr,
                        Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx + 45, 8, Graphics.FONT_XTINY, " | FINAL",
                        Graphics.TEXT_JUSTIFY_CENTER);
        }

        // --- Row 2: Team labels ---
        dc.setColor(0x6699FF, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - 50, 26, Graphics.FONT_XTINY, "TEAM A",
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(0xFF9933, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx + 50, 26, Graphics.FONT_XTINY, "TEAM B",
                    Graphics.TEXT_JUSTIFY_CENTER);

        // --- Row 3: Large scores ---
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - 45, 44, Graphics.FONT_NUMBER_HOT, teamAScore.toString(),
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 56, Graphics.FONT_MEDIUM, "-",
                    Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx + 45, 44, Graphics.FONT_NUMBER_HOT, teamBScore.toString(),
                    Graphics.TEXT_JUSTIFY_CENTER);

        // --- Separator line ---
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(cx - 80, 98, cx + 80, 98);

        // --- Recent events feed (last 3, newest on top) ---
        var feedY = 102;
        var lineH = 16;

        if (!recentEvent1.equals("")) {
            dc.setColor(getEventColor(recentEventType1), Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, feedY, Graphics.FONT_XTINY, recentEvent1,
                        Graphics.TEXT_JUSTIFY_CENTER);
            feedY += lineH;
        }
        if (!recentEvent2.equals("")) {
            dc.setColor(getEventColor(recentEventType2), Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, feedY, Graphics.FONT_XTINY, recentEvent2,
                        Graphics.TEXT_JUSTIFY_CENTER);
            feedY += lineH;
        }
        if (!recentEvent3.equals("")) {
            dc.setColor(getEventColor(recentEventType3), Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, feedY, Graphics.FONT_XTINY, recentEvent3,
                        Graphics.TEXT_JUSTIFY_CENTER);
            feedY += lineH;
        }

        // --- Live transcript / heard text ---
        var transcriptY = 155;
        if (!liveTranscript.equals("")) {
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, transcriptY, Graphics.FONT_XTINY, liveTranscript,
                        Graphics.TEXT_JUSTIFY_CENTER);
        } else if (!failedTranscript.equals("")) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, transcriptY, Graphics.FONT_XTINY, failedTranscript,
                        Graphics.TEXT_JUSTIFY_CENTER);
        }

        // --- Undo button at bottom (only during active game with events) ---
        if (gameStatus.equals("active") && lastEventId != null) {
            undoBtnY = 180;
            undoBtnHeight = 34;
            if (undoConfirm) {
                dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
                dc.drawText(cx, undoBtnY + 5, Graphics.FONT_SMALL,
                            "Undone!", Graphics.TEXT_JUSTIFY_CENTER);
            } else {
                dc.setColor(0x990000, 0x990000);
                dc.fillRoundedRectangle(cx - 42, undoBtnY, 84, undoBtnHeight, 8);
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.drawText(cx, undoBtnY + 5, Graphics.FONT_SMALL,
                            "UNDO", Graphics.TEXT_JUSTIFY_CENTER);
            }
        }

        // --- Error display ---
        if (!lastError.equals("")) {
            dc.setColor(Graphics.COLOR_ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 222, Graphics.FONT_XTINY, lastError,
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
        dc.drawText(cx, h / 2 + 40, Graphics.FONT_XTINY, "Polling...  v2.0",
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
            BballService.fetchGameState(method(:onDataReceived));
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
