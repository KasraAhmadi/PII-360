<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Personally Identifiable Information (PII) on text, image, and pdf with pii masking on pdf.</h1>
</div>

## Table of Contents

- [Features](#features)
- [GettingStarted](#gettingStarted)
- [License](#license)

## Features <a name="features"></a>
- [PII Model](https://huggingface.co/onnx-community/piiranha-v1-detect-personal-information-ONNX)
- [VLM Model](https://huggingface.co/onnx-community/FastVLM-0.5B-ONNX)
- [React 19](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)

### Getting Started <a name="gettingStarted"></a>

#### Developing and building
This template comes with build configs for both Chrome and Firefox. Running
`dev` or `build` commands without specifying the browser target will build
for Chrome by default.

1. Install Node.js
2. Clone this repository
3. Run `yarn` or `npm i` (check your node version >= 16)
4. Run `yarn dev[:chrome|:firefox]`, or `npm run dev[:chrome|:firefox]`

Running a `dev` command will build your extension and watch for changes in the 
source files. Changing the source files will refresh the corresponding 
`dist_<chrome|firefox>` folder.

To create an optimized production build, run `yarn build[:chrome|:firefox]`, or
`npm run build[:chrome|:firefox]`.

## License
- Original code: CC BY-NC 4.0  
- Includes Apple AMLR model (Research-only, non-commercial)  
- Includes license under CC BY-NC-ND 4.0  
- Therefore, this project as a whole is **non-commercial use only**.