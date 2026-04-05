<div align="center">
<h1>Data Forge</h1>
<p><strong>A robust synthetic dataset generator and viewer for fine-tuning LLMs</strong></p>
</div>

## Overview

Data Forge is a high-performance web application designed to generate and view synthetic, multi-turn roleplay datasets in **_<ins>ChatML</ins> format_**. The application connects to local AI inference engines (like **Oobabooga** and **SGLang**) to produce diverse dialogue interactions based on structural guidelines and personas.
<img width="2558" height="1175" alt="image" src="https://github.com/user-attachments/assets/968bbaf5-6153-4d70-8744-49a089d79ebc" />

## Features

- **Dual Backend Architecture:** Connects easily to local Oobabooga (Port 5000) or high-throughput SGLang (Port 30000).
- **Structured Outputs:** Enforces strict adherence to JSON and ChatML representations (using GBNF grammar for Oobabooga and native JSON objects).
- **Logic Protocols:** Choose between "Creative" persona exploration or "Factual" data grounding.
- **Queue and Batch Handling:** Add iterations into staging pipelines for automated output generation.
- **Multimodal Support:** Incorporate image-based prompts.
- **Built-in Audit Viewer:** Verify and inspect generated multi-turn interactions and their initial system instruction payloads.
- **JSONL Exporting:** Ready-to-go dataset downloads for LLM fine-tuning pipelines.

## Prerequisites

- **Node.js**
- Local language models running via:
  - Oobabooga (OpenAI API extension) 
  - OR SGLang

## Installation and Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. (Optional) Set up Environment Variables in `.env` if necessary based on your API requirements.

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```

## Workflow

1. Select your target target engine from the **Processing Core**.
2. Write a base character source, instruction logic, or attach images.
3. Queue stages, set concurrency limits, and total entries.
4. Click **Initialize Forge** and let the generation loop run.
5. Export your `forge_[amount].jsonl` dataset!
