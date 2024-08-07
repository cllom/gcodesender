var port, textEncoder, writableStreamClosed, writer;
var serialBuffer = "";
var printingStatus = "";
var currentGcodeLine = 0;
var stuffToPrint;
var lineHeight;

const serialResultsDiv = document.getElementById("serialResults");


const fileSelector = document.getElementById('file-selector');
fileSelector.addEventListener('change', (event) => {
    var input = event.target;

    var reader = new FileReader();
    reader.onload = function () {
        var text = reader.result;
        loadGcode(text)
    };
    reader.readAsText(input.files[0]);
});


async function connectSerial() {
    try {
        // Prompt user to select any serial port.
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: document.getElementById("baud").value });

        textEncoder = new TextEncoderStream();
        writableStreamClosed = textEncoder.readable.pipeTo(port.writable);

        writer = textEncoder.writable.getWriter();
        listenToPort();
    } catch {
        alert("Serial Connection Failed");
    }
}

async function sendSerialLine() {
    dataToSend = document.getElementById("lineToSend").value;
    if (document.getElementById("addLine").checked == true) dataToSend = dataToSend + "\r\n";
    if (document.getElementById("echoOn").checked == true) appendToTerminal("> " + dataToSend);
    await writer.write(dataToSend);
}

async function listenToPort() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    // Listen to data coming from the serial device.
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            // Allow the serial port to be closed later.
            reader.releaseLock();
            break;
        }
        // value is a string.
        appendToTerminal(value);
        serialBuffer += value;

        let theLastLine = lines(serialBuffer)

        if (printingStatus == "PRINTING") {
            theLastLine = String(theLastLine).replace(/(\r\n|\n|\r)/gm, "");
            console.log(console.log(JSON.stringify(theLastLine)));
            if (theLastLine == "ok") {
                sendNextLine();
            }
        }
    }
}


async function appendToTerminal(newStuff) {
    serialResultsDiv.innerHTML += newStuff;


    if (serialResultsDiv.innerHTML.length > 3000) serialResultsDiv.innerHTML = serialResultsDiv.innerHTML.slice(serialResultsDiv.innerHTML.length - 3000);

    //scroll down to bottom of div
    serialResultsDiv.scrollTop = serialResultsDiv.scrollHeight;
}

document.getElementById("lineToSend").addEventListener("keyup", async function (event) {
    if (event.keyCode === 13) {
        sendSerialLine();
    }
})
document.getElementById("baud").value = (localStorage.baud == undefined ? 9600 : localStorage.baud);
document.getElementById("addLine").checked = (localStorage.addLine == "false" ? false : true);
document.getElementById("echoOn").checked = (localStorage.echoOn == "false" ? false : true);




async function setPrintingStatus(newValue) {
    printingStatus = newValue;
    document.getElementById("status").value = printingStatus;
}



async function populateGcode() {
    let stuffToPrint = await fetchItem("./small.gcode");
    loadGcode(stuffToPrint)
}

async function loadGcode(gcodeToShow){
    document.getElementById("gcodeToSend").value = gcodeToShow;

    gcodeLines = gcodeToShow.split('\n');

    lineHeight = document.getElementById("gcodeToSend").scrollHeight / gcodeLines.length;

}


function lines(text) {
    let resultingLines = text.split('\n');
    //console.log(resultingLines, resultingLines.length);
    //console.log(resultingLines[resultingLines.length - 2])
    return resultingLines[resultingLines.length - 2];
}



async function fetchItem(itemToFetch) {
    const response = await fetch(itemToFetch);
    const textResponse = await response.text();
    return textResponse;
}


function Jump(line) {
    var ta = document.getElementById("gcodeToSend");
    var jump = (line) * lineHeight;

    ta.scrollTop = jump;
}

async function printGcode() {
    await setPrintingStatus("PRINTING");
    currentGcodeLine = 0;
    sendNextLine();
}

async function togglePause() {
    if (printingStatus == "PRINTING" | printingStatus == "PAUSED") {
        if (printingStatus == "PRINTING") {
            await setPrintingStatus("PAUSED");
        } else {
            await setPrintingStatus("PRINTING");
            sendNextLine();
        }
    }
}

async function sendNextLine() {
    serialBuffer = "";

    let lineIsComment = true;

    while (lineIsComment) {
        currentGcodeLine++;
        if (gcodeLines.length <= currentGcodeLine) {
            await setPrintingStatus("COMPLETED");
            return
        }
        Jump(currentGcodeLine);
        lineToSend = gcodeLines[currentGcodeLine].trim();

        if (lineToSend.startsWith(";") | lineToSend == "") {
            appendToTerminal("Skip Comment #" + currentGcodeLine + "> " + lineToSend + "\r\n");
            lineIsComment = true;
        } else {
            lineIsComment = false;
        }
    }

    appendToTerminal("Sending #" + currentGcodeLine + "> " + lineToSend + "\r\n");

    await writer.write(lineToSend + "\r\n");
}

// jog controller
async function move(direction) {
    const stepSize = parseFloat(document.getElementById('step-size').value);
    const feedRate = parseInt(document.getElementById('feed-rate').value);
    let gCodeCommand = 'G21G91 ';
    switch(direction) {
        case 'up':
            controllerState.y += stepSize;
            gCodeCommand += `Y-${stepSize}`;
            break;
        case 'down':
            controllerState.y -= stepSize;
            gCodeCommand += `Y${stepSize}`;
            break;
        case 'left':
            controllerState.x -= stepSize;
            gCodeCommand += `X-${stepSize}`;
            break;
        case 'right':
            controllerState.x += stepSize;
            gCodeCommand += `X${stepSize}`;
            break;
        case 'zUp':
            controllerState.z += stepSize;
            gCodeCommand += `Z${stepSize}`;
            break;
        case 'zDown':
            controllerState.z -= stepSize;
            gCodeCommand += `Z-${stepSize}`;
            break;
    }
    updateStateDisplay();

    // Send Serial Line
    gCodeCommand = gCodeCommand + 'F' +feedRate + "\r\n";
    if (document.getElementById("echoOn").checked == true) appendToTerminal("> " + gCodeCommand);
    await writer.write(gCodeCommand);
}

// controller state
let controllerState = {
    x: 0,
    y: 0,
    z: 0
};

async function resetToZero() {
    controllerState.x = 0;
    controllerState.y = 0;
    controllerState.z = 0;
    updateStateDisplay();
    alert('Position reset to (0, 0, 0)');

    // Send Serial Line
    gCodeCommand = 'G10 P0 L20 X0 Y0 Z0' + "\r\n";
    if (document.getElementById("echoOn").checked == true) appendToTerminal("> " + gCodeCommand);
    await writer.write(gCodeCommand);
}

function updateStateDisplay() {
    document.getElementById('controller-state').innerText = `Current Position: (${controllerState.x}, ${controllerState.y}, ${controllerState.z})`;
}

function rebootController() {
    controllerState.x = 0;
    controllerState.y = 0;
    controllerState.z = 0;
    document.getElementById('step-size').value = 1;
    updateStateDisplay();
    alert('Controller rebooted to initial state');
}

//populateGcode();