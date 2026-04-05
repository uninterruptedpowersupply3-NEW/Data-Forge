const GBNF_GRAMMAR = `root ::= "{" ws "\\\"chatml\\\"" ws ":" ws string "," ws "\\\"messages\\\"" ws ":" ws "[" ws message-list ws "]" ws "}"
message-list ::= message ("," ws message)*
message ::= "{" ws "\\\"role\\\"" ws ":" ws role-val "," ws "\\\"content\\\"" ws ":" ws string ws "}"
role-val ::= "\\\"system\\\"" | "\\\"user\\\"" | "\\\"assistant\\\""
string ::= "\\\"" string-chars "\\\""
string-chars ::= ([^"\\\\\\n] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))*
ws ::= [ \\t\\n\\r]*`;

async function runTest() {
    console.log("Connecting using fetch...");
    try {
        const response = await fetch("http://127.0.0.1:5000/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "oobabooga",
                messages: [
                    { role: "system", content: "You are a test agent. Output a single message." },
                    { role: "user", content: "Say hello!" }
                ],
                temperature: 0.1,
                max_tokens: 150,
                grammar_string: GBNF_GRAMMAR
            })
        });
        
        const data = await response.json();
        const content = data.choices[0].message?.content || "{}";
        console.log("Raw Response:", content);
        
        const parsed = JSON.parse(content);
        if (parsed.chatml !== undefined && Array.isArray(parsed.messages)) {
            console.log("✅ Fetch Test Passed!");
            process.exit(0);
        } else {
            console.error("❌ Fetch Test Failed structure.");
            process.exit(1);
        }
    } catch(err) {
        console.error("❌ Test Failed:", err);
        process.exit(1);
    }
}
runTest();
