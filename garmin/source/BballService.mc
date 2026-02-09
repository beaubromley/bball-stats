using Toybox.Communications;
using Toybox.System;
using Toybox.Lang;

module BballService {
    // API server address — the phone proxies HTTP through Garmin Connect app
    // Change this to match your LAN IP when on a different network
    const API_BASE = "http://192.168.0.133:3001";

    function fetchGameState(callback as Lang.Method) as Void {
        var url = API_BASE + "/games/active";
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(url, null, options, callback);
    }

    function sendUndo(callback as Lang.Method) as Void {
        var url = API_BASE + "/games/active/undo";
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(url, {}, options, callback);
    }
}
