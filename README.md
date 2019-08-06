# gliflow

Generates executable workflows from [gliffy](https://www.gliffy.com/) diagrams diagrams

## Installation

```shell
npm install gliflow --save
```

## Usage

Supported shapes:

* `com.gliffy.shape.flowchart.flowchart_v1.default.input_output` - Accepts input values which are stored in the process and may be used later to evaluate decisions or display outputs.
* `com.gliffy.shape.flowchart.flowchart_v1.default.display` - Displays the text (evaluated as `JavaScript`) contained in the shape.
* `com.gliffy.shape.flowchart.flowchart_v1.default.decision` - Evaluates conditions defined on it's edges (lines) and proceeds to the next shape based on whether the condition evalutes to `true`. 
* `com.gliffy.shape.flowchart.flowchart_v1.default.process` - Evaluates the text contained in the shape as `JavaScript`.


```javascript
const gliflow = require('gliflow');

const g = gliflow(gliffyJson);
g.input('enter_first_number', 1).next();
g.input('enter_second_number', 2).next();
console.log(g.awaitingIO().text); 
```

*See the [tests](./lib/gliffyParser.test.js) for additional examples*

## License
[MIT](LICENSE.md)