
const EXAMPLES = {
    "Redundant Instructions": `MVI A, 05H
NOP
NOP
MOV B, A
NOP
NOP
HLT`,

    "Dead-Looking Assignments": `MVI A, 05H
MVI A, 05H
MOV B, A
HLT`,

    "Unreachable Code": `JMP NEXT
MVI A, 05H
NOP
NEXT: MVI B, 02H
HLT`,

    "Arithmetic Program": `MVI A, 05H
MVI B, 03H
ADD B
NOP
NOP
MOV C, A
HLT`,

    "Countdown Loop": `MVI C, 05H
LOOP: DCR C
NOP
JNZ LOOP
HLT`,

    "Data Transfer": `MVI A, 10H
NOP
MOV B, A
NOP
MOV C, B
HLT`,

    "Conditional Jump": `MVI A, 00H
CPI 00H
JZ ZERO
MVI B, 01H
JMP END
ZERO: MVI B, 00H
END: HLT`,

    "Memory Operations": `LXI H, 2050H
MOV A, M
NOP
INR A
MOV M, A
HLT`,

    "Subroutine": `MVI A, 05H
CALL INCREASE
JMP FINISH
INCREASE: INR A
RET
FINISH: HLT`,

    "Stack Operations": `LXI SP, 3000H
MVI B, 10H
PUSH B
MOV B, A
POP B
HLT`,

    "Multiple Labels": `JMP NEXT
UNUSED: NOP
MVI A, 01H
NEXT: MVI B, 02H
NOP
HLT`,

    "Combined Demo": `MVI A, 05H
NOP
NOP
MVI B, 03H
ADD B
JMP FINISH
MVI C, 09H
NOP
FINISH: MOV D, A
HLT`
};

const source = document.getElementById("source");
const originalOutput = document.getElementById("original-output");
const optimizedOutput = document.getElementById("optimized-output");
const report = document.getElementById("report");
const details = document.getElementById("details");
const downloadButton = document.getElementById("download-btn");

const originalCount = document.getElementById("original-count");
const optimizedCount = document.getElementById("optimized-count");
const removedCount = document.getElementById("removed-count");
const reduction = document.getElementById("reduction");

const SUPPORTED = new Set([
    "MOV", "MVI", "LXI", "LDA", "STA", "LHLD", "SHLD",
    "LDAX", "STAX", "XCHG", "XTHL", "SPHL", "PCHL",
    "ADD", "ADI", "ADC", "ACI", "SUB", "SUI", "SBB",
    "SBI", "INR", "DCR", "INX", "DCX", "DAD", "DAA",
    "ANA", "ANI", "ORA", "ORI", "XRA", "XRI", "CMP",
    "CPI", "CMA", "CMC", "STC", "RLC", "RRC", "RAL",
    "RAR", "JMP", "JZ", "JNZ", "JC", "JNC", "JP",
    "JM", "JPE", "JPO", "CALL", "CZ", "CNZ", "CC",
    "CNC", "CP", "CM", "CPE", "CPO", "RET", "RNZ",
    "RZ", "RNC", "RC", "RP", "RM", "RPE", "RPO",
    "PUSH", "POP", "RST", "IN", "OUT", "EI", "DI",
    "HLT", "NOP"
]);

const JUMPS = new Set([
    "JMP", "JZ", "JNZ", "JC", "JNC", "JP", "JM",
    "JPE", "JPO", "CALL", "CZ", "CNZ", "CC", "CNC",
    "CP", "CM", "CPE", "CPO"
]);

function loadExample() {
    const selected = document.getElementById("example-select").value;
    source.value = EXAMPLES[selected] || "";

    resetResults();
    report.textContent = `Loaded example: ${selected}. Click Optimize Assembly to compare results.`;
}

function resetResults() {
    originalOutput.textContent = "Your original code will appear here.";
    optimizedOutput.textContent = "Your optimized code will appear here.";
    originalCount.textContent = "—";
    optimizedCount.textContent = "—";
    removedCount.textContent = "—";
    reduction.textContent = "—";
    details.replaceChildren();

    const item = document.createElement("li");
    item.textContent = "Run the optimizer to see the results.";
    details.appendChild(item);

    downloadButton.disabled = true;
}

function parseLine(line) {
    let content = line.trim();

    if (!content || content.startsWith(";")) {
        return { blank: true, label: null, opcode: null, content };
    }

    // Separate inline comments.
    const commentIndex = content.indexOf(";");
    let code = commentIndex >= 0
        ? content.slice(0, commentIndex).trim()
        : content;

    const labelMatch = code.match(/^([A-Za-z_]\w*):\s*(.*)$/);

    let label = null;
    if (labelMatch) {
        label = labelMatch[1].toUpperCase();
        code = labelMatch[2].trim();
    }

    const opcodeMatch = code.match(/^([A-Za-z]+)\b/);
    const opcode = opcodeMatch ? opcodeMatch[1].toUpperCase() : null;

    return {
        blank: false,
        label,
        opcode,
        code,
        content,
        comment: commentIndex >= 0 ? content.slice(commentIndex) : ""
    };
}

function countInstructions(code) {
    return code.split(/\r?\n/).filter(line => {
        const parsed = parseLine(line);
        return Boolean(parsed.opcode);
    }).length;
}

function optimizeAssembly(code) {
    const lines = code.split(/\r?\n/);
    const warnings = [];
    const labelLines = new Map();
    const parsedLines = lines.map(parseLine);

    // Collect labels and detect duplicates.
    parsedLines.forEach((item, index) => {
        if (item.label) {
            if (labelLines.has(item.label)) {
                warnings.push(`Duplicate label "${item.label}" on line ${index + 1}.`);
            } else {
                labelLines.set(item.label, index);
            }
        }

        if (item.opcode && !SUPPORTED.has(item.opcode)) {
            warnings.push(`Unsupported instruction "${item.opcode}" on line ${index + 1}; preserved in output.`);
        }
    });

    let kept = lines.map((line, index) => ({
        line,
        parsed: parsedLines[index],
        removedReason: null
    }));

    // Rule 1: Remove redundant consecutive NOP instructions.
    let previousWasNop = false;

    kept = kept.filter(item => {
        const parsed = item.parsed;

        // Never remove a line containing a label or comment.
        if (parsed.label || parsed.blank || !parsed.opcode) {
            previousWasNop = false;
            return true;
        }

        if (parsed.opcode === "NOP") {
            if (previousWasNop) {
                item.removedReason = "Redundant consecutive NOP";
                return false;
            }

            previousWasNop = true;
            return true;
        }

        previousWasNop = false;
        return true;
    });

    // Rule 2: Remove straight-line code after an unconditional JMP
    // until its target label, but only when that target exists.
    const afterNopPass = kept;
    kept = [];
    let skipUntil = null;

    for (const item of afterNopPass) {
        const parsed = item.parsed;

        if (skipUntil !== null) {
            if (parsed.label === skipUntil) {
                skipUntil = null;
                kept.push(item);
                continue;
            }

            // Stop at another label rather than risking removal of
            // code that might be reachable through a different jump.
            if (parsed.label && parsed.label !== skipUntil) {
                skipUntil = null;
                kept.push(item);
                continue;
            }

            item.removedReason = "Unreachable after unconditional JMP";
            continue;
        }

        kept.push(item);

        if (
            parsed.opcode === "JMP" &&
            !parsed.label
        ) {
            const targetMatch = parsed.code.match(/^JMP\s+([A-Za-z_]\w*)/i);
            if (targetMatch) {
                const target = targetMatch[1].toUpperCase();

                if (labelLines.has(target)) {
                    skipUntil = target;
                } else {
                    warnings.push(`JMP target "${target}" was not found; no unreachable-code removal was applied.`);
                }
            }
        }
    }

    const optimizedCode = kept.map(item => item.line).join("\n");
    const originalInstructions = countInstructions(code);
    const optimizedInstructions = countInstructions(optimizedCode);
    const removedInstructions = Math.max(
        0,
        originalInstructions - optimizedInstructions
    );

    const percent = originalInstructions > 0
        ? (removedInstructions / originalInstructions) * 100
        : 0;

    return {
        optimizedCode,
        originalInstructions,
        optimizedInstructions,
        removedInstructions,
        percent,
        warnings
    };
}

function optimizeCode() {
    const code = source.value;

    if (!code.trim()) {
        report.textContent = "Please enter assembly code or load an example first.";
        return;
    }

    const result = optimizeAssembly(code);

    originalOutput.textContent = code;
    optimizedOutput.textContent = result.optimizedCode;

    originalCount.textContent = result.originalInstructions;
    optimizedCount.textContent = result.optimizedInstructions;
    removedCount.textContent = result.removedInstructions;
    reduction.textContent = `${result.percent.toFixed(1)}%`;

    details.replaceChildren();

    const addDetail = text => {
        const item = document.createElement("li");
        item.textContent = text;
        details.appendChild(item);
    };

    addDetail(`Original instructions: ${result.originalInstructions}`);
    addDetail(`Optimized instructions: ${result.optimizedInstructions}`);
    addDetail(`Instructions removed: ${result.removedInstructions}`);
    addDetail(`Instruction-count reduction: ${result.percent.toFixed(1)}%`);

    if (result.removedInstructions === 0) {
        addDetail("No supported optimization rule changed the instruction count.");
    }

    result.warnings.forEach(warning => addDetail(`Warning: ${warning}`));

    report.textContent = result.warnings.length
        ? `Optimization completed with ${result.warnings.length} warning(s). Review the report below.`
        : "Optimization completed. Compare the original and optimized code below.";

    downloadButton.disabled = false;
}

function downloadOptimizedCode() {
    const code = optimizedOutput.textContent;

    if (!code || code === "Your optimized code will appear here.") {
        return;
    }

    const blob = new Blob([code], {
        type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "optimized_code.asm";
    link.click();

    URL.revokeObjectURL(url);
}

document.getElementById("load-btn").addEventListener("click", loadExample);
document.getElementById("optimize-btn").addEventListener("click", optimizeCode);
document.getElementById("clear-btn").addEventListener("click", () => {
    source.value = "";
    resetResults();
    report.textContent = "Code cleared. Enter assembly instructions or load an example.";
});
downloadButton.addEventListener("click", downloadOptimizedCode);

// Load the selected example when the page opens.
loadExample();
