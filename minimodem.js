function Minimodem(ctx) {
    //Audio playing or audio listening flag
    this.audioPlaying = false

    //Audio context generation
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    //Empty variables for listening state
    this.micInput;
    this.decodeNode;
    this.decodeFunction;
    this.antialias;

    //Analyser to get FFT data
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.smoothingTimeConstant = 0;
    this.analyser.fftSize = 512;

    //Create graphic contexts if object have an graphic context
    if(ctx){
        this.graphNode = this.audioContext.createScriptProcessor(0, 1, 1);
        this.graphContext = ctx
        this.startSpectrogram()
        this.graphNode.onaudioprocess = this.drawSpectrogram.bind(this)
    }

    //Web API connections
    this.analyser.connect(this.graphNode);
    this.graphNode.connect(this.audioContext.destination);
}

//Creating spectrogram
Minimodem.prototype.startSpectrogram = function () {
    this.graphContext.font = "10px Arial";
    this.graphContext.fillStyle = "#ffffff";
    this.graphContext.textAlign = "end";
    this.graphContext.textBaseline="middle";

    //Axis labels
    var axis = 10;
    var nyq = this.audioContext.sampleRate/2;
    var step = nyq/axis
    for(i = 0; i<axis ; i++){
        this.graphContext.fillText((nyq*(i)/(1000*axis)).toFixed(2) + " kHz", this.graphContext.canvas.width-1, this.graphContext.canvas.height*(i/axis));
    }
}

//Drawing spectrogram
Minimodem.prototype.drawSpectrogram = function () {
    var array = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(array);

    //Color scale
    var hot = new chroma.ColorScale({
        colors:['#000000','#ffff00','#ff0000'],
        positions:[0,0.5,1],
        mode:'rgb',
        limits:[this.analyser.minDecibels, this.analyser.maxDecibels]
    });

    requestAnimationFrame(function(){
        //Painting in the first column (check the axis label offset)
        var axisSpace = 50
        for (var i = 0; i < array.length; i++) {
            if (this.audioPlaying == true) {
                this.graphContext.fillStyle = hot.getColor(array[i]).hex();
            }else{
                this.graphContext.fillStyle = "#000000";
            }
            this.graphContext.fillRect(this.graphContext.canvas.width-axisSpace,i, 1, 1);
        }

        //Move all the graph to the left (contious time effect)
        var imageData = this.graphContext.getImageData(1, 0, this.graphContext.canvas.width-axisSpace, this.graphContext.canvas.height);
        this.graphContext.putImageData(imageData, 0, 0);
    }.bind(this));
}

//Transmit an data packet (it includes one or more channels and )
Minimodem.prototype.transmit = function(data) {
    if (this.audioPlaying == false){
        var channels = data["config"]["channels"];
        var period = data["config"]["period"];

        this.audioPlaying = true

        setTimeout(function(){
            this.audioPlaying = false;
        }.bind(this),data["data"].length*period)


        for (channel = 0 ; channel < channels ; channel++){
            var oscillator = this.audioContext.createOscillator();
            var gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.analyser);
            gainNode.connect(this.audioContext.destination)

            oscillator.start(0);

            for (time = 0 ; time < data["data"].length ; time++){
                oscillator.frequency.setValueAtTime(data["data"][time][channel]["frequency"],this.audioContext.currentTime+(period*time)/1000)
                gainNode.gain.setValueAtTime(data["data"][time][channel]["gain"],this.audioContext.currentTime+(period*time)/1000)
                //EXPERIMENTAL: Exponential changes between symbols in order to avoid high frequencies in changes
                //oscillator.frequency.setTargetAtTime(data["data"][time][channel]["frequency"],this.audioContext.currentTime+(period*time)/1000,0.01)
                //gainNode.gain.setTargetAtTime(data["data"][time][channel]["gain"],this.audioContext.currentTime+(period*time)/1000,0.01)
            }
            oscillator.stop(this.audioContext.currentTime+((data["data"].length)*period)/1000);
        }
    }
};

//Binary Frequency Shift Keying
Minimodem.prototype.BFSK = function(data,period,sFreq,shift){
    var data = this.dataToBin(data)
    var config = {"channels":1,"period":period};
    var rawData = [];

    while(data.length % 1 != 0){
        data += "0"
    }
    console.log("Converted data: " + data)


    for (i = 0 ; i < data.length ; i++){
        var instant = [];
        for (channel = 0 ; channel < config["channels"] ; channel++){
            if (data[i] == "0"){
                var symbol = {"frequency":sFreq,"gain":1}
            }else{
                var symbol = {"frequency":sFreq+shift,"gain":1}
            }
            instant.push(symbol)
        }
        rawData.push(instant)
    }

    this.transmit({"config":config,"data":rawData})
}

//Quad Frequency Shift Keying
Minimodem.prototype.QFSK = function(data,period,sFreq,shift){
    var data = this.dataToBin(data)
    var config = {"channels":1,"period":period};
    var rawData = [];

    while(data.length % 2 != 0){
        data += "0"
    }
    console.log("Converted data: " + data)

    for (i = 0 ; i < data.length ; i+=2){
        var instant = [];
        for (channel = 0 ; channel < config["channels"] ; channel++){
            if (data.substring(i,i+2) == "00"){
                var symbol = {"frequency":sFreq,"gain":1}
            }else if (data.substring(i,i+2) == "01") {
                var symbol = {"frequency":sFreq+shift,"gain":1}
            }else if (data.substring(i,i+2) == "10") {
                var symbol = {"frequency":sFreq+2*shift,"gain":1}
            }else if (data.substring(i,i+2) == "11"){
                var symbol = {"frequency":sFreq+3*shift,"gain":1}
            }
            instant.push(symbol)
        }
        rawData.push(instant)
    }

    this.transmit({"config":config,"data":rawData})
}
 // Binary Amplitude Shift Keying
Minimodem.prototype.BASK = function(data,period,sFreq){
    var data = this.dataToBin(data)
    var config = {"channels":1,"period":period};
    var rawData = [];

    while(data.length % 1 != 0){
        data += "0"
    }
    console.log("Converted data: " + data)

    for (i = 0 ; i < data.length ; i++){
        var instant = [];
        for (channel = 0 ; channel < config["channels"] ; channel++){
            if (data[i] == "0"){
                var symbol = {"frequency":sFreq,"gain":0.1}
            }else{
                var symbol = {"frequency":sFreq,"gain":0.5}
            }
            instant.push(symbol)
        }
        rawData.push(instant)
    }
    this.transmit({"config":config,"data":rawData})
}

//Auxiliar function to convert everything to binary stream
Minimodem.prototype.dataToBin = function(t) {
    var output="";
    var input= t;
    for (i=0; i < input.length; i++) {
        output += input[i].charCodeAt(0).toString(2);
    }
    return output
}

//Receive audio info processing
Minimodem.prototype.receive = function(data) {
    // var array = new Float32Array(this.analyser.frequencyBinCount);
    // this.analyser.getFloatFrequencyData(array);
    //
    // var freq = 4410
    // var spread = 1000
    // var thr = this.analyser.minDecibels + 0.1*(this.analyser.maxDecibels - this.analyser.minDecibels)
    // var nyq = this.audioContext.sampleRate/2
    //
    // var s = "";
    // for (var i = freq-spread; i < freq+spread; i++) {
    //     var index = Math.round(i/nyq * array.length);
    //     if(array[index] > thr){
    //         s = (i/1000).toFixed(2) +  " kHz: " + array[index].toFixed(4) + " dB"
    //     }
    // }
    // $("#received").html(s)
}

//Asking for the microphone
Minimodem.prototype.listen = function(){
    navigator.webkitGetUserMedia({audio:true},
        this.onStream.bind(this),
        function(fail) {console.log(fail)}
    );

};

//Include microphone information in the system
Minimodem.prototype.onStream = function(stream) {
    this.audioPlaying = true
    this.micInput = this.audioContext.createMediaStreamSource(stream);

    //Antialias filter (is it working?)
    this.antialias = this.audioContext.createBiquadFilter();
    this.antialias.type = "lowpass"
    this.antialias.frequency.value = this.audioContext.sampleRate/2;
    //console.log("Antialias filter at " + this.audioContext.sampleRate/2000 + " kHz")
    this.antialias.Q.value = 0;

    //Creating an receiver module
    this.decodeNode = this.audioContext.createScriptProcessor(0, 1, 1);
    this.decodeNode.onaudioprocess = this.receive.bind(this);

    //Web API connections
    this.micInput.connect(this.antialias);
    this.antialias.connect(this.analyser);
    this.analyser.connect(this.decodeNode);
    this.decodeNode.connect(this.audioContext.destination);
};
