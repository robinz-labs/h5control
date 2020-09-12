// H5Control app framework v0.3.5

var Arduino = {

	UNO: {
		A0:  14,	A1:  15,	A2:  16,	A3:  17,
		A4:  18,	A5:  19,	A6:  20,	A7:  21
	},

	MEGA: {
		A0:  54,	A1:  55,	A2:  56,	A3:  57,
		A4:  58,	A5:  59,	A6:  60,	A7:  61,
		A8:  62,	A9:  63,	A10: 64,	A11: 65,
		A12: 66,	A13: 67,	A14: 68,	A15: 69
	},

	DUE: {
		A0:  54,	A1:  55,	A2:  56,	A3:  57,
		A4:  58,	A5:  59,	A6:  60,	A7:  61,
		A8:  62,	A9:  63,	A10: 64,	A11: 65,
		DAC0:66,	DAC1:67
	}
};

function hexEncode(number) { return (number<16 ? "0" : "") + number.toString(16); }
function hexDecode(hexstr) { return parseInt(hexstr, 16); }

function getUrlHost() {
	var items = document.URL.split("/");
	if (items.length>3 && (items[0]=="http:" || items[0]=="https:") && items[1]=="")
		return items[2].split(":")[0];
	return "";
}

function getUrlParameter(param) {
	var parameters = document.URL.split("?")[1];
	if (parameters) {
		var pairs = parameters.split("&");
		for (var n=0 ; n<pairs.length ; n++) {
			var pair = pairs[n].split("=");
			if (pair.length==2 && param==pair[0]) return pair[1];
		}
	}
	return "";
}

var H5Control = function() {

	// list of all remote IO control objects managed in this system
	this.unitObjects = {};
	this.pinObjects  = {};
	this.portObjects = {};

	// web socket object
	this.ws = null;

	// synchronous call options
	this.isSyncCall      = false;
	this.syncCallTimeout = 1000;

	// event callbacks
	this.whenConnect           = function(connections) {};
	this.whenDisconnect        = function() {};
	this.whenUnitReady         = function(unit) {};
	this.whenSendRawMessage    = function(unit, msg) {};
	this.whenReceiveRawMessage = function(unit, msg) {};
	this.whenSendRawData       = function(data) {};
	this.whenReceiveRawData    = function(data) {};
};

H5Control.prototype.unitObject = function (unit) {
	return this.unitObjects[unit];
};
H5Control.prototype.pinObject = function (unit, pin) {
	if (this.pinObjects[unit] != undefined) return this.pinObjects[unit][pin];
	return null;
};
H5Control.prototype.portObject = function (unit, port) {
	if (this.portObjects[unit] != undefined) return this.portObjects[unit][port];
	return null;
};

H5Control.prototype.assignUnitObject = function (unit, obj) {
	if (unit>=0 && unit<=0xff) {
		this.unitObject[unit] = obj;
		return true;
	}
	return false;
};
H5Control.prototype.assignPinObject = function (unit, pin, obj) {
	if (unit>=0 && unit<=0xff && pin>=0 && pin<=0xff) {
		if (this.pinObjects[unit] == undefined) this.pinObjects[unit] = {};
		this.pinObjects[unit][pin] = obj;
		return true;
	}
	return false;
};
H5Control.prototype.assignPortObject = function (unit, port, obj) {
	if (unit>=0 && unit<=0xff && port>=0 && port<=0xff) {
		if (this.portObjects[unit] == undefined) this.portObjects[unit] = {};
		this.portObjects[unit][port] = obj;
		return true;
	}
	return false;
};

H5Control.prototype.setup = function(host, wsPort, httpPort) {

	var defaultHost     = "127.0.0.1";
	var defaultWsPort   = 50000; // websocket - for asynchronous mode
	var defaultHttpPort = 58000; // http      - for synchronous  mode

	if (getUrlHost()) defaultHost = getUrlHost();
	if (getUrlParameter("ip")) defaultHost = getUrlParameter("ip");
	if (getUrlParameter("ws_port")) defaultWsPort = getUrlParameter("ws_port");
	if (getUrlParameter("http_port")) defaultHttpPort = getUrlParameter("http_port");

	this.host = host || defaultHost;
	this.wsPort = wsPort || defaultWsPort;
	this.httpPort = httpPort || defaultHttpPort;

	var h5c = this;

	if ("WebSocket" in window) {

		this.ws = new WebSocket("ws://"+this.host+":"+this.wsPort+"/rioc");

		this.ws.onopen = function() {
			var sign = 0x00;
			h5c.sendRawMessage(0x00, [0x00, 0x00, sign, 0, 0, 0, 0, 0]); // app sign in
		};

		this.ws.onclose = function() { h5c.whenDisconnect(); };
		this.ws.onmessage = function (evt) {

			var data = evt.data;
			h5c.whenReceiveRawData(data);

			if (data.length==22 && data.substr(0,2)=="00") {
				var unit = hexDecode(data.substr(2,2));
				var msg = [
					hexDecode(data.substr( 6,2)), hexDecode(data.substr( 8,2)),
					hexDecode(data.substr(10,2)), hexDecode(data.substr(12,2)),
					hexDecode(data.substr(14,2)), hexDecode(data.substr(16,2)),
					hexDecode(data.substr(18,2)), hexDecode(data.substr(20,2))];

				h5c.whenReceiveRawMessage(unit, msg);
				h5c.processRawMessage(unit, msg);
			}
		};

	} else {
		alert("WebSocket is NOT supported by your Browser!");
	}
};

H5Control.prototype.resetUnit = function(unit) {
	unit = unit || 0xff;
	this.sendRawMessage(unit, [0x00, 0x01, 0, 0, 0, 0, 0, 0]);
};

H5Control.prototype.resetAll = function() {
	this.resetUnit(0xff); // reset all units
};

H5Control.prototype.beginSyncAll = function() {
	this.sendRawMessage(0xff, [0x00, 0x04, 0, 0, 0, 0, 0, 0]);
};

H5Control.prototype.finishSyncAll = function() {
	this.sendRawMessage(0xff, [0x00, 0x05, 0, 0, 0, 0, 0, 0]);
};

H5Control.prototype.silenceAll = function(silent) {
	silent = silent || true;
	this.sendRawMessage(0xff, [0x00, 0x07, (silent ? 0x01 : 0x00), 0, 0, 0, 0, 0]);
};

H5Control.prototype.sendRawData = function(data) {
	this.ws.send(data);
	this.whenSendRawData(data);
};

H5Control.prototype.sendRawMessage = function(unit, msg) {
	var data = "0000" + hexEncode(unit & 0xff) +
		hexEncode(msg[0] & 0xff) + hexEncode(msg[1] & 0xff) +
		hexEncode(msg[2] & 0xff) + hexEncode(msg[3] & 0xff) +
		hexEncode(msg[4] & 0xff) + hexEncode(msg[5] & 0xff) +
		hexEncode(msg[6] & 0xff) + hexEncode(msg[7] & 0xff);
	this.ws.send(data);
	this.whenSendRawData(data);
	this.whenSendRawMessage(unit, msg);
};

H5Control.prototype.sendAndWaitRawMessage = function(unit, msg, timeout) {

	timeout = timeout || this.syncCallTimeout;

	var data = "0000" + hexEncode(unit & 0xff) +
		hexEncode(msg[0] & 0xff) + hexEncode(msg[1] & 0xff) +
		hexEncode(msg[2] & 0xff) + hexEncode(msg[3] & 0xff) +
		hexEncode(msg[4] & 0xff) + hexEncode(msg[5] & 0xff) +
		hexEncode(msg[6] & 0xff) + hexEncode(msg[7] & 0xff);

	this.whenSendRawData(data);
	this.whenSendRawMessage(unit, msg);

	var request = new XMLHttpRequest();
	var requestUrl = "http://" + this.host + ":" + this.httpPort +
		"/rioc/sendAndWait?msg=" + data +
		"&timeout=" + timeout;
	request.open("GET", requestUrl , false);
	request.send(null);
	if (request.status === 200) {
		data = request.responseText;
		if (data.length==22 && data.substr(0,2)=="00") {
			var rsp = [
				hexDecode(data.substr( 6,2)), hexDecode(data.substr( 8,2)),
				hexDecode(data.substr(10,2)), hexDecode(data.substr(12,2)),
				hexDecode(data.substr(14,2)), hexDecode(data.substr(16,2)),
				hexDecode(data.substr(18,2)), hexDecode(data.substr(20,2))];
			return rsp;
		}
	}
	return null;
};

H5Control.prototype.waitRsp = function(milliseconds) {
	milliseconds = milliseconds || 0;
	if (milliseconds>0) this.syncCallTimeout = milliseconds;
	this.isSyncCall = true;
};

H5Control.prototype.nowaitRsp = function() {
	this.isSyncCall = false;
};

H5Control.prototype.sendMessage = function(unit, msg) {

	if (this.isSyncCall && unit != 0xff) {

		// has return value when using synchronous mode
		return this.sendAndWaitRawMessage(unit, msg);
	} else {

		// no return value when using asynchronous mode
		this.sendRawMessage(unit, msg);
	}
};

H5Control.prototype.processRawMessage = function(unit, msg) {

	if (msg[0]==0x00) {
		// system control
		if (msg[1] == 0x80) {
			this.whenConnect(msg[2]);
		} else if (msg[1] == 0x8f) {
			this.whenUnitReady(unit);
		}

		// unit control
		var obj = this.unitObject(unit);
		if (obj != undefined) obj.processRawMessage(msg);
	} else if (msg[0]==0x05) {
		// port control
		var port = msg[2];
		var obj = this.portObject(unit, port);
		if (obj != undefined) obj.processRawMessage(msg);
	} else {
		// pin control
		var pin = msg[2];
		var obj = this.pinObject(unit, pin);
		if (obj != undefined) obj.processRawMessage(msg);
	}
};

// global shared instance
var h5control = new H5Control();


var DeviceUnit = function() {

	this.unit = -1;

	// event callbacks
	this.whenReady      = function() {};
	this.whenBeginSync  = function() {};
	this.whenFinishSync = function() {};
	this.whenSleep      = function(milliseconds) {};
	this.whenSilence    = function(silent) {};
};

DeviceUnit.prototype.setup = function(unit) {
	if (h5control.assignUnitObject(unit, this)) {
		this.unit = unit;
	}
};

DeviceUnit.prototype.reset = function() {
	h5control.sendRawMessage(this.unit, [0x00, 0x01, 0, 0, 0, 0, 0, 0]);
};

DeviceUnit.prototype.beginSync = function() {
	var rsp = h5control.sendMessage(this.unit, [0x00, 0x04, 0, 0, 0, 0, 0, 0]);
	if (rsp!==undefined) return (rsp!=null);
};

DeviceUnit.prototype.finishSync = function() {
	var rsp = h5control.sendMessage(this.unit, [0x00, 0x05, 0, 0, 0, 0, 0, 0]);
	if (rsp!==undefined) return (rsp!=null);
};

DeviceUnit.prototype.sleep = function(milliseconds, rspMode) {
	rspMode = rspMode || 1;
	var rsp = h5control.sendMessage(this.unit, [0x00, 0x06, (milliseconds>>8)&0xff, milliseconds&0xff, (h5control.isSyncCall ? 1 : rspMode), 0, 0, 0]);
	if (rsp!==undefined) return (rsp!=null);
};

DeviceUnit.prototype.silence = function(silent) {
	silent = silent || true;
	var rsp = h5control.sendMessage(this.unit, [0x00, 0x07, (silent ? 0x01 : 0x00), 0, 0, 0, 0, 0]);
	if (rsp!==undefined) return (rsp!=null);
};

DeviceUnit.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x8f: this.whenReady(); break;
		case 0x84: this.whenBeginSync(); break;
		case 0x85: this.whenFinishSync(); break;
		case 0x86: this.whenSleep(msg[2] << 8 | msg[3]); break;
		case 0x87: this.whenSilence(msg[2]); break;
	}
};



var DigitalInResistor = {
	INTERNAL_PULLUP   : 0,
	EXTERNAL          : 1,
	INTERNAL_PULLDOWN : 2
};

var DigitalIn = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup        = function(done) {};
	this.whenGetValue     = function(value) {};
	this.whenStartMonitor = function() {};
	this.whenStopMonitor  = function() {};
	this.whenUpdateValue  = function(value) {};
};

DigitalIn.prototype.setup = function(unit, pin, resistor, filterLevel, samplingInterval) {
	resistor = resistor || DigitalInResistor.INTERNAL_PULLUP;
	filterLevel = filterLevel || 0;
	samplingInterval = samplingInterval || 0;

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = resistor;
		var rsp = h5control.sendMessage(unit, [0x01, 0x00, pin, mode, filterLevel&0xff, (samplingInterval>>8)&0xff, samplingInterval&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

DigitalIn.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x01, 0x01, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? rsp[3] : null);
	}
};

DigitalIn.prototype.startMonitor = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x01, 0x02, this.pin, 0x01, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

DigitalIn.prototype.stopMonitor = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x01, 0x02, this.pin, 0x00, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

DigitalIn.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = msg[3];
			this.whenGetValue(this.live.value);
			break;
		case 0x82:
			this.live.isMonitorOn = (msg[3]!=0);
			if (this.live.isMonitorOn)
				this.whenStartMonitor();
			else
				this.whenStopMonitor();
			break;
		case 0x83:
			this.live.value = msg[3];
			this.whenUpdateValue(this.live.value);
			break;
	}
};



var DigitalOut = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup        = function(done) {};
	this.whenSetValue     = function(value) {};
	this.whenSetPwmPeriod = function(period) {};
	this.whenSetPwmValue  = function(value) {};
	this.whenPulse        = function(value, pw) {};
	this.whenGetValue     = function(value) {};
	this.whenGetPwmValue  = function(value) {};
};

DigitalOut.prototype.setup = function(unit, pin) {
	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x02, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

DigitalOut.prototype.setValue = function(value) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x02, 0x01, this.pin, value & 0xff, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

DigitalOut.prototype.setPwmPeriod = function(period) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x02, 0x02, this.pin, period&0xff, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

DigitalOut.prototype.setPwmValue = function(value) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x02, 0x03, this.pin, value & 0xff, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

DigitalOut.prototype.pulse = function(value, pw) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x02, 0x04, this.pin, value & 0xff, (pw >> 16) & 0xff, (pw >> 8) & 0xff, pw & 0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

DigitalOut.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x02, 0x05, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? rsp[3] : null);
	}
};

DigitalOut.prototype.getPwmValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x02, 0x06, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? rsp[3] : null);
	}
};

DigitalOut.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = msg[3];
			this.whenSetValue(this.live.value);
			break;
		case 0x82:
			this.live.pwmPeriod = msg[3];
			this.whenSetPwmPeriod(this.live.pwmPeriod);
			break;
		case 0x83:
			this.live.pwmValue = msg[3];
			this.whenSetPwmValue(this.live.pwmValue);
			break;
		case 0x84:
			this.live.pulseValue = msg[3];
			this.live.pulseWidth = (msg[4]<<16)|(msg[5]<<8)|msg[6];
			this.whenPulse(this.live.pulseValue, this.live.pulseWidth);
			break;
		case 0x85:
			this.live.value = msg[3];
			this.whenGetValue(this.live.value);
			break;
		case 0x86:
			this.live.pwmValue = msg[3];
			this.whenGetPwmValue(this.live.pwmValue);
			break;
	}
};



var AnalogIn = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup        = function(done) {};
	this.whenGetValue     = function(value) {};
	this.whenStartMonitor = function() {};
	this.whenStopMonitor  = function() {};
	this.whenUpdateValue  = function(value) {};
};

AnalogIn.prototype.setup = function(unit, pin, filterLevel, samplingInterval) {
	filterLevel = filterLevel || 0;
	samplingInterval = samplingInterval || 0;

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x03, 0x00, pin, mode, filterLevel&0xff, (samplingInterval>>8)&0xff, samplingInterval&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

AnalogIn.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x03, 0x01, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? (rsp[3]<<8)|rsp[4] : null);
	}
};

AnalogIn.prototype.startMonitor = function(interval, significantBits) {
	interval = interval || 0;
	significantBits = significantBits || 0;
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x03, 0x02, this.pin, 0x01, (interval>>8)&0xff, interval&0xff, significantBits&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

AnalogIn.prototype.stopMonitor = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x03, 0x02, this.pin, 0x00, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

AnalogIn.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = (msg[3]<<8)|msg[4];
			this.whenGetValue(this.live.value);
			break;
		case 0x82:
			this.live.isMonitorOn = (msg[3]!=0);
			if (this.live.isMonitorOn)
				this.whenStartMonitor();
			else
				this.whenStopMonitor();
			break;
		case 0x83:
			this.live.value = (msg[3]<<8)|msg[4];
			this.whenUpdateValue(this.live.value);
			break;
	}
};



var AnalogOut = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup    = function(done) {};
	this.whenSetValue = function(value) {};
	this.whenGetValue = function(value) {};
};

AnalogOut.prototype.setup = function(unit, pin) {
	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x04, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

AnalogOut.prototype.setValue = function(value) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x04, 0x01, this.pin, (value>>8)&0xff, value&0xff, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

AnalogOut.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x04, 0x02, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? (rsp[3]<<8)|rsp[4] : null);
	}
};

AnalogOut.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = (msg[3]<<8)|msg[4];
			this.whenSetValue(this.live.value);
			break;
		case 0x82:
			this.live.value = (msg[3]<<8)|msg[4];
			this.whenGetValue(this.live.value);
			break;
	}
};



var UartSerialConfig = {
	_5N1 : 0x00,	_6N1 : 0x02,	_7N1 : 0x04,
	_8N1 : 0x06,	_5N2 : 0x08,	_6N2 : 0x0A,
	_7N2 : 0x0C,	_8N2 : 0x0E,	_5E1 : 0x20,
	_6E1 : 0x22,	_7E1 : 0x24,	_8E1 : 0x26,
	_5E2 : 0x28,	_6E2 : 0x2A,	_7E2 : 0x2C,
	_8E2 : 0x2E,	_5O1 : 0x30,	_6O1 : 0x32,
	_7O1 : 0x34,	_8O1 : 0x36,	_5O2 : 0x38,
	_6O2 : 0x3A,	_7O2 : 0x3C,	_8O2 : 0x3E
};

var UartSerial = function() {

	this.unit = -1;
	this.port = -1;
	this.live = {};

	// event callbacks
	this.whenSetup   = function(done) {};
	this.whenReceive = function(bytes) {};
};

UartSerial.prototype.setup = function(unit, port, baud, config) {
	baud = baud || 9600;
	config = config || UartSerialConfig._8N1;

	if (h5control.assignPortObject(unit, port, this)) {
		this.unit = unit;
		this.port = port;
		var rsp = h5control.sendMessage(unit, [0x05, 0x00, port, (baud >> 16) & 0xff, (baud >> 8) & 0xff, baud & 0xff, config, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

UartSerial.prototype.send = function(bytes) {
	if (this.unit != -1 && this.port != -1) {
		var i = 0;
		var data = [0, 0, 0, 0];
		for (var n=0 ; n<bytes.length ; n++) {
			data[i] = bytes[n];
			i++;
			if (i==4 || n==bytes.length-1) {
				h5control.sendRawMessage(this.unit, [0x05, 0x01, this.port, i, data[0], data[1], data[2], data[3]]);
				i = 0;
				data = [0, 0, 0, 0];
			}
		}
	}
};

UartSerial.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x82:
			var len = msg[3];
			if (len>=1 && len<=4) {
				var data = [];
				for (var i=0 ; i<len ; i++) data.push(msg[i+4]);
				this.live.dataReceived = data;
				this.whenReceive(this.live.dataReceived);
			}
			break;
	}
};



var MultipleDigitalIn = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup        = function(done) {};
	this.whenGetValue     = function(value) {};
	this.whenStartMonitor = function() {};
	this.whenStopMonitor  = function() {};
	this.whenUpdateValue  = function(value) {};
};

MultipleDigitalIn.prototype.setup = function(unit, pin, number, resistor) {

	resistor = resistor || DigitalInResistor.INTERNAL_PULLUP;

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = resistor;
		var rsp = h5control.sendMessage(unit, [0x06, 0x00, pin, number, mode, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

MultipleDigitalIn.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x06, 0x01, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? rsp[3]|(rsp[4]<<8)|(rsp[5]<<16)|(rsp[6]<<24) : null);
	}

};

MultipleDigitalIn.prototype.startMonitor = function(interval) {
	interval = interval || 0;
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x06, 0x02, this.pin, 0x01, (interval >> 8) & 0xff, interval & 0xff, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

MultipleDigitalIn.prototype.stopMonitor = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x06, 0x02, this.pin, 0x00, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

MultipleDigitalIn.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = msg[3]|(msg[4]<<8)|(msg[5]<<16)|(msg[6]<<24);
			this.whenGetValue(this.live.value);
			break;
		case 0x82:
			this.live.isMonitorOn = (msg[3]!=0);
			if (this.live.isMonitorOn)
				this.whenStartMonitor();
			else
				this.whenStopMonitor();
			break;
		case 0x83:
			this.live.value = msg[3]|(msg[4]<<8)|(msg[5]<<16)|(msg[6]<<24);
			this.whenUpdateValue(this.live.value);
			break;
	}
};



var MultipleDigitalOut = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup    = function(done) {};
	this.whenSetValue = function(value) {};
	this.whenGetValue = function(value) {};
};

MultipleDigitalOut.prototype.setup = function(unit, pin, number) {
	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x07, 0x00, pin, number, mode, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

MultipleDigitalOut.prototype.setValue = function(value) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x07, 0x01, this.pin, value&0xff, (value>>8)&0xff, (value>>16)&0xff,  (value>>24)&0xff,  0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

MultipleDigitalOut.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x07, 0x02, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? rsp[3]|(rsp[4]<<8)|(rsp[5]<<16)|(rsp[6]<<24) : null);
	}
};

MultipleDigitalOut.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = msg[3]|(msg[4]<<8)|(msg[5]<<16)|(msg[6]<<24);
			this.whenSetValue(this.live.value);
			break;
		case 0x82:
			this.live.value = msg[3]|(msg[4]<<8)|(msg[5]<<16)|(msg[6]<<24);
			this.whenGetValue(this.live.value);
			break;
	}
};



var MotorMode = {
	NORMAL  : 0,	// dc motor with two lines v+ and v-
	PWM_DIR : 1		// motor driven with pwm line and dir line
};

var Motor = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup    = function(done) {};
	this.whenSetPower = function(power) {};
	this.whenSetPower = function(power) {};
};


Motor.prototype.setup = function(unit, pin1, pin2, mode) {

	mode = mode || MotorMode.NORMAL;

	if (h5control.assignPinObject(unit, pin1, this)) {
		this.unit = unit;
		this.pin = pin1;
		var rsp = h5control.sendMessage(unit, [0x11, 0x00, pin1, pin2, mode, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

Motor.prototype.setPower = function(power) {
	var dir = (power<0 ? 1 : 0);
	var power_ = Math.abs(power);
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x11, 0x01, this.pin, dir, power_&0xff, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Motor.prototype.getPower = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x11, 0x02, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp != null ? (rsp[3] ? -1 : 1) * rsp[4] : null);
	}
};

Motor.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.power = (msg[3] ? -1 : 1) * msg[4];
			this.whenSetPower(this.live.power);
			break;
		case 0x82:
			this.live.power = (msg[3] ? -1 : 1) * msg[4];
			this.whenGetPower(this.live.power);
			break;
	}
};



var Stepper = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup       = function(done) {};
	this.whenStep        = function(steps) {};
	this.whenGoto        = function(position) {};
	this.whenStop        = function() {};
	this.whenSetSpeed    = function(speed) {};
	this.whenGetSpeed    = function(speed) {};
	this.whenSetPosition = function(position) {};
	this.whenGetPosition = function(position) {};
};

Stepper.prototype.setup = function(unit, pin1, pin2, pin3, pin4) {

	if (h5control.assignPinObject(unit, pin1, this)) {
		this.unit = unit;
		this.pin = pin1;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x12, 0x00, pin1, pin2, pin3, pin4, mode, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

Stepper.prototype.step = function(steps) {
	var dir = (steps<0 ? 1 : 0);
	var steps_ = Math.abs(steps);
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x01, this.pin, dir, (steps_>>8)&0xff, steps_&0xff, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Stepper.prototype.goto = function(position) {
	var sign = (position<0 ? 1 : 0);
	var position_ = Math.abs(position);
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x02, this.pin, sign, (position_>>16)&0xff, (position_>>8)&0xff, position_&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Stepper.prototype.stop = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x03, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Stepper.prototype.setSpeed = function(speed) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x04, this.pin, (speed>>8)&0xff, speed&0xff, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Stepper.prototype.getSpeed = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x05, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? (rsp[3]<<8)|rsp[4] : null);
	}
};

Stepper.prototype.setPosition = function(position) {
	var sign = (position<0 ? 1 : 0);
	var position_ = Math.abs(position);
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x06, this.pin, sign, (position_>>16)&0xff, (position_>>8)&0xff, position_&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Stepper.prototype.getPosition = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x12, 0x07, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? (rsp[3] ? -1 : 1)*((rsp[4]<<16)|(rsp[5]<<8)|rsp[6]) : null);
	}
};

Stepper.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.steps = (msg[3] ? -1 : 1)*((msg[4]<<8)|msg[5]);
			this.whenStep(this.live.steps);
			break;
		case 0x82:
			this.live.destination = (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]);
			this.whenGoto(this.live.destination);
			break;
		case 0x83:
			this.whenStop();
			break;
		case 0x84:
			this.live.speed = (msg[3]<<8)|msg[4];
			this.whenSetSpeed(this.live.speed);
			break;
		case 0x85:
			this.live.speed = (msg[3]<<8)|msg[4];
			this.whenGetSpeed(this.live.speed);
			break;
		case 0x86:
			this.live.position = (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]);
			this.whenSetPosition(this.live.position);
			break;
		case 0x87:
			this.live.position = (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]);
			this.whenGetPosition(this.live.position);
			break;
	}
};



var RudderServo = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup     = function(done) {};
	this.whenSetAngle  = function(angle) {};
	this.whenGetAngle  = function(angle) {};
	this.whenSetEnable = function(enable) {};
	this.whenGetEnable = function(enable) {};
};

RudderServo.prototype.setup = function(unit, pin) {

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x13, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

RudderServo.prototype.setAngle = function(angle) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x13, 0x01, this.pin, angle & 0xff, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

RudderServo.prototype.getAngle = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x13, 0x02, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp != null ? rsp[3] : null);
	}
};

RudderServo.prototype.setEnable = function(enable) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x13, 0x03, this.pin, enable & 0xff, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

RudderServo.prototype.getEnable = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x13, 0x04, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp != null ? rsp[3] : null);
	}
};

RudderServo.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.angle = msg[3];
			this.whenSetAngle(this.live.angle);
			break;
		case 0x82:
			this.live.angle = msg[3];
			this.whenGetAngle(this.live.angle);
			break;
		case 0x83:
			this.live.enable = msg[3];
			this.whenSetEnable(this.live.enable);
			break;
		case 0x84:
			this.live.enable = msg[3];
			this.whenGetEnable(this.live.enable);
			break;
	}
};



var Encoder = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup        = function(done) {};
	this.whenGetValue     = function(value) {};
	this.whenStartMonitor = function() {};
	this.whenStopMonitor  = function() {};
	this.whenUpdateValue  = function(value) {};
};

Encoder.prototype.setup = function(unit, pinA, pinB, resistor, samplingInterval) {
	resistor = resistor || DigitalInResistor.INTERNAL_PULLUP;
	samplingInterval = samplingInterval || 0;

	if (h5control.assignPinObject(unit, pinA, this)) {
		this.unit = unit;
		this.pin = pinA;
		var mode = resistor;
		var rsp = h5control.sendMessage(unit, [0x21, 0x00, pinA, pinB, mode, (samplingInterval>>8)&0xff, samplingInterval&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

Encoder.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x21, 0x01, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp != null ? (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]) : null);
	}
};

Encoder.prototype.startMonitor = function(interval) {
	interval = interval || 0;
	if (this.unit != -1 && this.pin != -1) {
		var significantBits = 0; // use default
		var rsp = h5control.sendMessage(this.unit, [0x21, 0x02, this.pin, 0x01, (interval>>8)&0xff, interval&0xff, significantBits&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Encoder.prototype.stopMonitor = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x21, 0x02, this.pin, 0x00, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Encoder.prototype.setValue = function(value) {
	if (this.unit != -1 && this.pin != -1) {
		var sign = (value < 0 ? 1 : 0);
		var value_  = Math.abs(value);
		var rsp = h5control.sendMessage(this.unit, [0x21, 0x04, this.pin, sign, (value_>>16)&0xff, (value_>>8)&0xff, value_&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

Encoder.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]);
			this.whenGetValue(this.live.value);
			break;
		case 0x82:
			this.live.isMonitorOn = (msg[3]!=0);
			if (this.live.isMonitorOn)
				this.whenStartMonitor();
			else
				this.whenStopMonitor();
			break;
		case 0x83:
			this.live.value = (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]);
			this.whenUpdateValue(this.live.value);
			break;
		case 0x84:
			this.live.value = (msg[3] ? -1 : 1)*((msg[4]<<16)|(msg[5]<<8)|msg[6]);
			this.whenSetValue(this.live.value);
			break;
	}
};



var UltrasonicRanger = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup    = function(done) {};
	this.whenGetValue = function(value) {};
};

UltrasonicRanger.prototype.setup = function(unit, pinOut, pinIn) {

	if (h5control.assignPinObject(unit, pinOut, this)) {
		this.unit = unit;
		this.pin = pinOut;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x22, 0x00, pinOut, pinIn, mode, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

UltrasonicRanger.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x22, 0x01, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null ? (rsp[3]<<8)|rsp[4] : null);
	}
};

UltrasonicRanger.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.value = (msg[3]<<8)|msg[4];
			this.whenGetValue(this.live.value);
			break;
	}
};

var ThermometerModel = {
	DHT11 : 1,
	DHT22 : 2
};

var Thermometer = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup    = function(done) {};
	this.whenGetValue = function(temperature, humidity) {};
};

Thermometer.prototype.setup = function(unit, pin, mode) {

	mode = mode || ThermometerModel.DHT11;

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var rsp = h5control.sendMessage(unit, [0x23, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

Thermometer.prototype.getValue = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x23, 0x01, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined)
			return (rsp!=null ? {temperature: ((rsp[3]<<8)|rsp[4])*0.1 - 273, humidity:((rsp[5]<<8)|rsp[6])*0.1} : null);
	}
};

Thermometer.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.temperature = ((msg[3]<<8)|msg[4])*0.1 - 273;
			this.live.humidity = ((msg[5]<<8)|msg[6])*0.1;
			this.whenGetValue(this.live.temperature, this.live.humidity);
			break;
	}
};



var MusicNote = {
	B0  : 31,
	C1  : 33,  CS1 : 35,  D1  : 37,  DS1 : 39,  E1  : 41,  F1  : 44,
	FS1 : 46,  G1  : 49,  GS1 : 52,  A1  : 55,  AS1 : 58,  B1  : 62,
	C2  : 65,  CS2 : 69,  D2  : 73,  DS2 : 78,  E2  : 82,  F2  : 87,
	FS2 : 93,  G2  : 98,  GS2 : 104, A2  : 110, AS2 : 117, B2  : 123,
	C3  : 131, CS3 : 139, D3  : 147, DS3 : 156, E3  : 165, F3  : 175,
	FS3 : 185, G3  : 196, GS3 : 208, A3  : 220, AS3 : 233, B3  : 247,
	C4  : 262, CS4 : 277, D4  : 294, DS4 : 311, E4  : 330, F4  : 349,
	FS4 : 370, G4  : 392, GS4 : 415, A4  : 440, AS4 : 466, B4  : 494,
	C5  : 523, CS5 : 554, D5  : 587, DS5 : 622, E5  : 659, F5  : 698,
	FS5 : 740, G5  : 784, GS5 : 831, A5  : 880, AS5 : 932, B5  : 988,
	C6  : 1047, CS6 : 1109, D6  : 1175, DS6 : 1245, E6  : 1319, F6  : 1397,
	FS6 : 1480, G6  : 1568, GS6 : 1661, A6  : 1760, AS6 : 1865, B6  : 1976,
	C7  : 2093, CS7 : 2217, D7  : 2349, DS7 : 2489, E7  : 2637, F7  : 2794,
	FS7 : 2960, G7  : 3136, GS7 : 3322, A7  : 3520, AS7 : 3729, B7  : 3951,
	C8  : 4186, CS8 : 4435, D8  : 4699, DS8 : 4978
};

var TonePlayer = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup = function(done) {};
	this.whenPlay  = function(frequency) {};
	this.whenStop  = function() {};
};

TonePlayer.prototype.setup = function(unit, pin) {

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0;
		var rsp = h5control.sendMessage(unit, [0x31, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

TonePlayer.prototype.play = function(frequency, duration) {
	duration = duration || 0;
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x31, 0x01, this.pin, (frequency>>8)&0xff, frequency&0xff, (duration>>8)&0xff, duration&0xff, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

TonePlayer.prototype.stop = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x31, 0x02, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

TonePlayer.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			this.live.frequency = (msg[3]<<8)|msg[4];
			this.whenPlay(this.live.frequency);
			break;
		case 0x82:
			this.whenStop();
			break;
	}
};



var LEDStripDataOrder = {
	RGB  : ((0 << 6) | (0 << 4) | (1 << 2) | (2)),
	RBG  : ((0 << 6) | (0 << 4) | (2 << 2) | (1)),
	GRB  : ((1 << 6) | (1 << 4) | (0 << 2) | (2)),
	GBR  : ((2 << 6) | (2 << 4) | (0 << 2) | (1)),
	BRG  : ((1 << 6) | (1 << 4) | (2 << 2) | (0)),
	BGR  : ((2 << 6) | (2 << 4) | (1 << 2) | (0)),

	WRGB : ((0 << 6) | (1 << 4) | (2 << 2) | (3)),
	WRBG : ((0 << 6) | (1 << 4) | (3 << 2) | (2)),
	WGRB : ((0 << 6) | (2 << 4) | (1 << 2) | (3)),
	WGBR : ((0 << 6) | (3 << 4) | (1 << 2) | (2)),
	WBRG : ((0 << 6) | (2 << 4) | (3 << 2) | (1)),
	WBGR : ((0 << 6) | (3 << 4) | (2 << 2) | (1)),

	RWGB : ((1 << 6) | (0 << 4) | (2 << 2) | (3)),
	RWBG : ((1 << 6) | (0 << 4) | (3 << 2) | (2)),
	RGWB : ((2 << 6) | (0 << 4) | (1 << 2) | (3)),
	RGBW : ((3 << 6) | (0 << 4) | (1 << 2) | (2)),
	RBWG : ((2 << 6) | (0 << 4) | (3 << 2) | (1)),
	RBGW : ((3 << 6) | (0 << 4) | (2 << 2) | (1)),

	GWRB : ((1 << 6) | (2 << 4) | (0 << 2) | (3)),
	GWBR : ((1 << 6) | (3 << 4) | (0 << 2) | (2)),
	GRWB : ((2 << 6) | (1 << 4) | (0 << 2) | (3)),
	GRBW : ((3 << 6) | (1 << 4) | (0 << 2) | (2)),
	GBWR : ((2 << 6) | (3 << 4) | (0 << 2) | (1)),
	GBRW : ((3 << 6) | (2 << 4) | (0 << 2) | (1)),

	BWRG : ((1 << 6) | (2 << 4) | (3 << 2) | (0)),
	BWGR : ((1 << 6) | (3 << 4) | (2 << 2) | (0)),
	BRWG : ((2 << 6) | (1 << 4) | (3 << 2) | (0)),
	BRGW : ((3 << 6) | (1 << 4) | (2 << 2) | (0)),
	BGWR : ((2 << 6) | (3 << 4) | (1 << 2) | (0)),
	BGRW : ((3 << 6) | (2 << 4) | (1 << 2) | (0))
};

var LEDStripDataStream = {
	KHZ800 : 0x0000,
	KHZ400 : 0x0100
};

var LEDStrip = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};
	this.live.leds = [];

	// event callbacks
	this.whenSetup = function(done) {};
	this.whenShowRGB = function(index, red, green, blue) {};
	this.whenSetRGB = function(index, red, green, blue) {};
	this.whenShow = function() {};
	this.whenGetRGB = function(index, red, green, blue) {};
};

LEDStrip.prototype.setup = function(unit, pin, count, mode) {

	count = count || 30;
	mode = mode || (LEDStripDataOrder.GRB + LEDStripDataStream.KHZ800);

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var rsp = h5control.sendMessage(unit, [0x41, 0x00, pin, mode, (count>>8)&0xff, count&0xff, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

LEDStrip.prototype.showRGB = function(index, red, green, blue) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x41, 0x01, this.pin, (index>>8)&0xff, index&0xff, red&0xff, green&0xff, blue&0xff]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

LEDStrip.prototype.setRGB = function(index, red, green, blue) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x41, 0x02, this.pin, (index>>8)&0xff, index&0xff, red&0xff, green&0xff, blue&0xff]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

LEDStrip.prototype.show = function() {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x41, 0x03, this.pin, 0, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null);
	}
};

LEDStrip.prototype.getRGB = function(index) {
	if (this.unit != -1 && this.pin != -1) {
		var rsp = h5control.sendMessage(this.unit, [0x41, 0x04, this.pin, (index>>8)&0xff, index&0xff, 0, 0, 0]);
		if (rsp!==undefined) return (rsp != null ? { red: rsp[5], green: rsp[6], blue: rsp[7] } : null);
	}
};

LEDStrip.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			var index = (msg[3]<<8)|msg[4];
			this.live.leds[index] = { red: msg[5], green: msg[6], blue: msg[7] };
			this.whenShowRGB(
				index,
				this.live.leds[index].red,
				this.live.leds[index].green,
				this.live.leds[index].blue);
			break;
		case 0x82:
			var index = (msg[3]<<8)|msg[4];
			this.live.leds[index] = { red: msg[5], green: msg[6], blue: msg[7] };
			this.whenSetRGB(
				index,
				this.live.leds[index].red,
				this.live.leds[index].green,
				this.live.leds[index].blue);
			break;
		case 0x83:
			this.whenShow();
			break;
		case 0x84:
			var index = (msg[3]<<8)|msg[4];
			this.live.leds[index] = { red: msg[5], green: msg[6], blue: msg[7] };
			this.whenGetRGB(
				index,
				this.live.leds[index].red,
				this.live.leds[index].green,
				this.live.leds[index].blue);
			break;
	}
};



var IRTransmitter = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup = function(done) {};
	this.whenSend  = function(bytes) {};
};

IRTransmitter.prototype.setup = function(unit, pin) {

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0; // reserved
		var rsp = h5control.sendMessage(unit, [0x51, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

IRTransmitter.prototype.send = function(bytes) {
	if (this.unit == -1 || this.pin == -1) return;
	var data = [0, 0, 0, 0];
	var len = (bytes.length<4 ? bytes.length : 4);
	for (var n=0 ; n<len ; n++) data[n] = bytes[n];
	var format = 0;
	var rsp = h5control.sendMessage(this.unit, [0x51, 0x01, this.pin, format, data[0], data[1], data[2], data[3]]);
	if (rsp!==undefined) return (rsp!=null);
};

IRTransmitter.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			var data = [];
			for (var i=0 ; i<4 ; i++) data.push(msg[i+4]);
			this.live.dataSent = data;
			this.whenSend(this.live.dataSent);
			break;
	}
};



var IRReceiver = function() {

	this.unit = -1;
	this.pin = -1;
	this.live = {};

	// event callbacks
	this.whenSetup   = function(done) {};
	this.whenReceive = function(bytes) {};
};

IRReceiver.prototype.setup = function(unit, pin) {

	if (h5control.assignPinObject(unit, pin, this)) {
		this.unit = unit;
		this.pin = pin;
		var mode = 0; // reserved
		var rsp = h5control.sendMessage(unit, [0x52, 0x00, pin, mode, 0, 0, 0, 0]);
		if (rsp!==undefined) return (rsp!=null && rsp[3]!=0);
	}
};

IRReceiver.prototype.processRawMessage = function(msg) {
	switch (msg[1]) {
		case 0x80:
			this.live.isAvailable = (msg[3]!=0);
			this.whenSetup(this.live.isAvailable);
			break;
		case 0x81:
			var data = [];
			for (var i=0 ; i<4 ; i++) data.push(msg[i+4]);
			this.live.dataReceived = data;
			this.whenReceive(this.live.dataReceived);
			break;
	}
};
