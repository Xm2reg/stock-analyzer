const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allow all origins

app.post('/get-stock-data', (req, res) => {
    const { stock_symbol } = req.body;

    if (!stock_symbol) {
        return res.status(400).json({ error: "Stock symbol is required" });
    }

    // Adjust 'ML.py' if it is in a subfolder, e.g., path.resolve(__dirname, 'scripts', 'ML.py')
    const pythonScriptPath = path.resolve(__dirname, 'ML.py');
    
    // Check operating system to use 'python' or 'python3'
    const pythonCommand = process.platform === "win32" ? "python" : "python3";

    const pythonProcess = spawn(pythonCommand, [pythonScriptPath, JSON.stringify({ stock_symbol })]);

    let output = '';
    let errorOutput = '';

    // Collect data from Python script
    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Collect errors (if any)
    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Python script exited with code ${code}`);
            console.error(`Error details: ${errorOutput}`);
            return res.status(500).json({ error: "Python script execution failed", details: errorOutput });
        }
        
        try {
            // Robust JSON extraction:
            // Sometimes Python prints warnings before the actual JSON.
            // We look for the first '{' and the last '}' to extract the valid JSON object.
            const jsonStartIndex = output.indexOf('{');
            const jsonEndIndex = output.lastIndexOf('}');

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const cleanJsonString = output.substring(jsonStartIndex, jsonEndIndex + 1);
                const parsedOutput = JSON.parse(cleanJsonString);

                if (parsedOutput.status === "error") {
                    return res.status(500).json(parsedOutput);
                } else {
                    return res.status(200).json(parsedOutput);
                }
            } else {
                throw new Error("No valid JSON found in Python output");
            }
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            console.error("Raw Output received:", output);
            return res.status(500).json({ error: "Failed to process Python output" });
        }
    });
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});