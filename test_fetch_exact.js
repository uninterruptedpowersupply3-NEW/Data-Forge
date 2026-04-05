const GBNF_GRAMMAR = `root ::= "{" ws "\\\"chatml\\\"" ws ":" ws string "," ws "\\\"messages\\\"" ws ":" ws "[" ws message-list ws "]" ws "}"
message-list ::= message ("," ws message)*
message ::= "{" ws "\\\"role\\\"" ws ":" ws role-val "," ws "\\\"content\\\"" ws ":" ws string ws "}"
role-val ::= "\\\"system\\\"" | "\\\"user\\\"" | "\\\"assistant\\\""
string ::= "\\\"" string-chars "\\\""
string-chars ::= ([^"\\\\\\n] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))*
ws ::= [ \\t\\n\\r]*`;

async function runTest() {
    console.log("Testing fetch explicitly payload...");
    const payload = {
        model: "sglang",
        messages: [
            { role: "system", content: "You are a test agent." },
            { role: "user", content: [{ type: "text", text: "Say hello!" }] }
        ],
        temperature: 1.0,
        max_tokens: 8192,
        extra_body: {
            grammar_string: GBNF_GRAMMAR
        }
    };
    try {
        const response = await fetch("http://127.0.0.1:30000/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer sk-1111111"
            },
            body: JSON.stringify(payload)
        });

        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Response text:", text);
        process.exit(0);
    } catch(err) {
        console.error("❌ Test Failed:", err);
        process.exit(1);
    }
}
runTest();
