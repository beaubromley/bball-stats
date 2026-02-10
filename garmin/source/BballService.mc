using Toybox.Communications;
using Toybox.System;
using Toybox.Lang;

module BballService {
    // API server address — phone proxies HTTPS through Garmin Connect app
    const API_BASE = "https://bball-stats-vert.vercel.app/api";

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
