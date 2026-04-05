import OpenAI from "openai";

const openai = new OpenAI({ 
    baseURL: "http://127.0.0.1:30000/v1", 
    apiKey: "sk-11111" 
});

const GBNF_GRAMMAR = `root ::= "{" ws "\\\"chatml\\\"" ws ":" ws string "," ws "\\\"messages\\\"" ws ":" ws "[" ws message-list ws "]" ws "}"
message-list ::= message ("," ws message)*
message ::= "{" ws "\\\"role\\\"" ws ":" ws role-val "," ws "\\\"content\\\"" ws ":" ws string ws "}"
role-val ::= "\\\"system\\\"" | "\\\"user\\\"" | "\\\"assistant\\\""
string ::= "\\\"" string-chars "\\\""
string-chars ::= ([^"\\\\\\n] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))*
ws ::= [ \\t\\n\\r]*`;

async function runTest() {
    console.log("Testing full generation with SGLang...");
    try {
        const response = await openai.chat.completions.create({
            model: "sglang",
            messages: [
                { role: "system", content: "You are a test agent." },
                { role: "user", content: [{ type: "text", text: "Say hello!" }] }
            ],
            temperature: 0.1,
            max_tokens: 50,
            extra_body: {
                grammar_string: GBNF_GRAMMAR
            }
        });

        console.log("Response:", response.choices[0].message?.content);
        process.exit(0);
    } catch(err) {
        console.error("❌ Test Failed:", err);
        process.exit(1);
    }
}
runTest();
