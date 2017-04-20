/*jslint sloppy:true */
/*global Windows:true, require, module, window, document, WinJS, cordova */

function SocketAdapter(dispatcher) {
    this._socket = new Windows.Networking.Sockets.StreamSocket();

    this._socket.control.keepAlive = true;

    this._dispatcher = dispatcher;
}

SocketAdapter.prototype.open = function (host, port) {
    var self = this;

    var hostName;
    try {
        hostName = new Windows.Networking.HostName(host);
    } catch (error) {
        throw "Error: Invalid host name. " + error;
    }

    return this._socket.connectAsync(hostName, port).then(function () {

        var clientReader = new Windows.Storage.Streams.DataReader(self._socket.inputStream);
        clientReader.inputStreamOptions = Windows.Storage.Streams.InputStreamOptions.partial;

        function startClientRead() {
            clientReader.loadAsync(4096).done(function (bytesRead) {

                try {
                    var bytes = new Array(bytesRead);
                    clientReader.readBytes(bytes);

                    var event = {
                        type: 'DataReceived',
                        data: bytes
                    }

                    self._dispatcher(event);

                    if (self._socket != null) {
                        // Restart the read for more bytes. We could just call startClientRead() but in
                        // the case subsequent read operations complete synchronously we start building
                        // up the stack and potentially crash. We use WinJS.Promise.timeout() to invoke
                        // this function after the stack for the current call unwinds.
                        WinJS.Promise.timeout().done(function () { return startClientRead(); });
                    }
                } catch (error) {
                    self.dispatchError(error);
                }
            }, function (error) {
                self.dispatchError(error);
            });
        }

        startClientRead();
    });
};

SocketAdapter.prototype.write = function (data) {
    var writer = new Windows.Storage.Streams.DataWriter(this._socket.outputStream);
    writer.writeBytes(data);
    return writer.storeAsync().then(function () {
        writer.detachStream();
    });
};

SocketAdapter.prototype.close = function () {
    this.dispatchClose(false);
    this._socket.close();
    this._socket = null;
};

SocketAdapter.prototype.dispatchError = function (error) {
    var event = {
        type: 'Error',
        message: error
    }

    this._dispatcher(event);
};

SocketAdapter.prototype.dispatchClose = function (hasError) {
    var event = {
        type: 'Close',
        hasError: hasError
    }

    this._dispatcher(event);
};

var _socketAdapters = {};

function dispatchEvent(event) {
    window.Socket.dispatchEvent(event);
}

function addSocketAdapter(socketKey, socketAdapter) {
    if (_socketAdapters.hasOwnProperty(socketKey)) {
        throw "Socket already connected.";
    }
    _socketAdapters[socketKey] = socketAdapter;
}

function getSocketAdapter(socketKey) {
    if (!_socketAdapters.hasOwnProperty(socketKey)) {
        throw "Socket isn't connected.";
    }
    return _socketAdapters[socketKey];
}

function removeSocketAdapter(socketKey) {
    if (!_socketAdapters.hasOwnProperty(socketKey)) {
        throw "Socket not found in collection.";
    }
    delete _socketAdapters[socketKey];
}

cordova.commandProxy.add("SocketsForCordova", {

    setOptions: function (successCallback, errorCallback, parameters) {
    },
    open: function (successCallback, errorCallback, parameters) {
        try {
            var socketKey = parameters[0];
            var host = parameters[1];
            var port = parameters[2];

            var socket = new SocketAdapter(function (event) {
                event.socketKey = socketKey;
                dispatchEvent(event);
            });

            socket.open(host, port).done(function () {
                addSocketAdapter(socketKey, socket);
                successCallback();
            }, function (error) {
                errorCallback(error);
            });
        } catch (error) {
            errorCallback(error);
        }
    },
    write: function (successCallback, errorCallback, parameters) {
        try {
            var socketKey = parameters[0];
            var dataToWrite = parameters[1];

            var socket = getSocketAdapter(socketKey);

            socket.write(dataToWrite).done(function () {
                successCallback();
            }, function (error) {
                errorCallback(error);
            });
        } catch (error) {
            errorCallback(error);
        }
    },
    shutdownWrite: function (successCallback, errorCallback, parameters) {
        errorCallback('Operation not supported on this platform.');
    },
    close: function (successCallback, errorCallback, parameters) {
        try {
            var socketKey = parameters[0];

            var socket = getSocketAdapter(socketKey);

            socket.close();
            removeSocketAdapter(socketKey);
            successCallback();
        } catch (error) {
            errorCallback(error);
        }
    }
});
