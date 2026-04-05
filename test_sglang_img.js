import OpenAI from "openai";

const openai = new OpenAI({ 
    baseURL: "http://127.0.0.1:30000/v1", 
    apiKey: "sk-11111" 
});

async function runTest() {
    console.log("Testing multimodal output onto QwenText model via SGLang...");
    try {
        const response = await openai.chat.completions.create({
            model: "sglang",
            messages: [
                { role: "system", content: "You are a test agent." },
                { role: "user", content: [
                    { type: "text", text: "Say hello!" },
                    { type: "image_url", image_url: { url: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } }
                ] }
            ],
            temperature: 0.1,
            max_tokens: 50,
        });

        console.log("Response:", response.choices[0].message?.content);
        process.exit(0);
    } catch(err) {
        console.error("❌ Test Failed:", err);
        process.exit(1);
    }
}
runTest();
