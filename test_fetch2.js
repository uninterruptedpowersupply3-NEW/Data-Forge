async function runTest() {
    console.log("Connecting using fetch without grammar...");
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
                max_tokens: 150
            })
        });
        
        const data = await response.json();
        console.log("Full data:", JSON.stringify(data, null, 2));
    } catch(err) {
        console.error("❌ Test Failed:", err);
    }
}
runTest();
