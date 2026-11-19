---
name: earshot
version: 1.0.0
description: Optional local CLI provider for procedural SFX generation and model-free sound-effect checks.
---

# Earshot SFX provider

Earshot is an optional local tool. Montry must continue to work when Earshot is not installed.

## Supported operations
- List available SFX bank entries.
- Render a bank sound to a WAV file.
- Run the model-free SFX check on an existing audio file.

## Operational rules
- Invoke only the allowlisted adapter methods. Never accept an arbitrary shell command.
- Use a process argument array with shell execution disabled.
- Keep the CLI executable, working directory, timeout and output limits configurable.
- Do not pass API keys or unrelated secrets to the subprocess environment.
- Capture stderr, exit status and bounded stdout.
- Treat missing executable, non-zero exit, timeout and invalid output as explicit skill failures.
- Generated WAVs must be checked and reviewed before use in a final mix.

## Limits
The CLI adapter does not install Earshot or its Python dependencies. The full package may require Python, NumPy, SciPy, soundfile and other dependencies; model-based Earshot commands may require PyTorch and Transformers. The SFX bank render/check path is model-free, but it still requires the Earshot package and its local runtime.
