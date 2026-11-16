# Third-party notices

## Ultimate Vocal Remover (UVR)

The vocal remover (`src/tools/audio/vocals/`) uses the AI model **UVR-MDX-NET Inst HQ 3**, made by the developers of [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) (Anjok07, aufr33 and contributors; the MDX-Net architecture is by Kuielab and Woosung Choi). UVR is MIT-licensed and its developers ask third-party applications that use their models to give credit to UVR and its developers: this is that credit. The model is not part of this repository; the browser downloads it from Hugging Face (`seanghay/uvr_models`) the first time the tool is used.

## Whisper and Transformers.js

The vocal remover finds a song's words with **Whisper** by OpenAI (MIT), in the exports with word times published by the onnx-community on Hugging Face (`whisper-base_timestamped`, `whisper-small_timestamped`), run in the browser with [Transformers.js](https://github.com/huggingface/transformers.js) by Hugging Face (Apache-2.0). The models are not part of this repository; the browser downloads them from Hugging Face the first time the words are searched for.

## React Bits

`src/components/bits/` (MicroSlats, ClickSpark, ShinyText, RollingNumber after Counter) is adapted from [React Bits](https://reactbits.dev) ([source](https://github.com/DavidHDev/react-bits)), used as part of this website under the following license.

```
MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software as part of an
application, website, or product, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

Commons Clause Restriction: You may use this Software, including for any
commercial purpose, so long as you do not sell, sublicense, or redistribute the
components themselves - whether alone, in a bundle, or as a ported version.
```

The full license text is in the React Bits repository: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md

## EFF large word list

The password generator's passphrases (`src/tools/everyday/password/words.ts`) use the EFF large word list for random passphrases, made by the Electronic Frontier Foundation, under the Creative Commons Attribution 3.0 United States license (https://creativecommons.org/licenses/by/3.0/us/). Source: https://www.eff.org/dice. The list is used as published, stored as one string.
