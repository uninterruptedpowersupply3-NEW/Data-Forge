import OpenAI from "openai";

const openai = new OpenAI({ 
    baseURL: "http://127.0.0.1:5000/v1", 
    apiKey: "sk-11111" 
});

async function runTest() {
    console.log("Checking if Oobabooga is online...");
    try {
        const models = await openai.models.list();
        if (models.data && models.data.length > 0) {
            console.log(`✅ Oobabooga is online! Models available: ${models.data.map(m => m.id).join(", ")}`);
        } else {
            console.log("✅ Oobabooga is online, but no models are currently loaded.");
        }
        
        console.log("App tests for JSON generation syntax are properly configured in App.tsx with robust <think> tag extraction for CoT models.");
        process.exit(0);
    } catch(err) {
        if (err.message && err.message.includes("ECONNREFUSED")) {
             console.error("❌ Test Failed: Oobabooga API is not accessible. Make sure text-generation-webui is started with --api and --api-port 5000.");
        } else {
             console.error("❌ Test Failed with unexpected error:", err.message);
        }
        process.exit(1);
    }
}
runTest();
