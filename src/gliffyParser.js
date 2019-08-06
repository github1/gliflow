"use strict";

const uuid = require('uuid');

const TYPE_MAP = {
  title: 'com.gliffy.shape.uml.uml_v1.default.note',
  input: {
    type: 'com.gliffy.shape.flowchart.flowchart_v1.default.input_output',
    isIO: true
  },
  preparation: {
    type: 'com.gliffy.shape.flowchart.flowchart_v1.default.preparation',
    isIO: true
  },
  display: {
    type: 'com.gliffy.shape.flowchart.flowchart_v1.default.display',
    isIO: true
  },
  line: 'com.gliffy.shape.basic.basic_v1.default.line',
  process: 'com.gliffy.shape.flowchart.flowchart_v1.default.process',
  decision: 'com.gliffy.shape.flowchart.flowchart_v1.default.decision'
};

const flowType = type => Object.keys(TYPE_MAP)
  .filter(key => TYPE_MAP[key] === type || TYPE_MAP[key].type === type)[0];

const isIO = type => TYPE_MAP[type].isIO;

const makeKey = value => value.toLowerCase().replace(/[^a-z]+/ig, '_');

class GliffyDiagram {
  constructor(objects, lines, index, groups, group) {
    this.objects = objects;
    this.lines = lines;
    this.index = index;
    this.groups = groups;
    this._group = makeKey(group || Object.keys(this.groups)
      .map(key => this.groups[key])
      .sort((a, b) => a.order - b.order)[0].key);
  }
  findEdge(start, end) {
    return this.lines.filter(object => object.type === 'line'
      && object.startId === start
      && object.endId === end)[0];
  }
  all() {
    return this.objects[this._group];
  }
  list(type) {
    return this.objects[this._group].filter(object => typeof type === 'undefined' || object.type === type)
  }
  group(group) {
    this._group = makeKey(group);
    return this;
  }
}

const createGliffyDiagramFromJson = gliffyJson => {
  const index = {};
  const groups = {};
  const lines = [];
  const objects = gliffyJson.stage.objects.map(object => {
    object.type = flowType(object.uid);
    return object;
  })
    .filter(object => typeof object.type !== 'undefined')
    .sort((a, b) => {
      return a.x - b.x;
    })
    .map(object => {
      let isIOType = isIO(object.type);
      const flowObj = {
        id: object.id,
        type: isIOType ? 'input' : object.type,
        ioType: object.type,
        io: isIOType,
        text: (object.children || [])
          .reduce((text, child) => {
            if (child.graphic && child.graphic.Text) {
              text += ` ${ (child.graphic.Text.html || '')
                .replace(/(<([^>]+)>)/ig, '') }`;
            }
            return text;
          }, '').trim().replace(/&amp;/g, '&').replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        group: [object].reduce((group, object) => {
          if (object.graphic &&
            object.graphic.Shape &&
            object.graphic.Shape.fillColor) {
            group = object.graphic.Shape.fillColor;
          }
          return group;
        }, 'default')
      };
      if (object.constraints
        && object.constraints.startConstraint
        && object.constraints.endConstraint) {
        flowObj.startId = object.constraints.startConstraint.StartPositionConstraint.nodeId;
        flowObj.endId = object.constraints.endConstraint.EndPositionConstraint.nodeId;
        lines.push(flowObj);
      }
      if (flowObj.io) {
        flowObj.inputKey = makeKey(flowObj.text);
      }
      if (flowObj.type === 'title') {
        groups[flowObj.group] = flowObj.text;
        groups[flowObj.group] = {
          title: flowObj.text,
          order: object.y,
          key: makeKey(flowObj.text)
        };
      }
      index[flowObj.id] = flowObj;
      return flowObj;
    }).filter(object => {
    return object.type !== 'title';
  }).map(object => {
    object.group = [groups[object.group]].map(group => group ? group.key : 'default')[0];
    return object;
  }).reduce((grouped, object) => {
    grouped[object.group] = grouped[object.group] || [];
    grouped[object.group].push(object);
    return grouped;
  }, {});
  return new GliffyDiagram(objects, lines, index, groups);
};

class GliffyRunner {

  constructor(diagram, position, context) {
    this.diagram = diagram;
    this.position = position || -1;
    this._context = JSON.parse(JSON.stringify(context || {visits: {}}));
    this.object = position === -1 ? null : diagram.index[position];
    if (this.position === -1) {
      this.object = diagram.all()[0];
      this.position = this.object.id;
    }
    if ((this.object.type === 'process' || this.object.ioType === 'display') && !this.object.evald) {
      this.object.evald = true;
      eval(this.object.text.replace(/context/,'this._context'));
    }
    this._context.curId = position;
  }

  group(group) {
    return new GliffyRunner(this.diagram.group(group));
  }

  context() {
    return JSON.parse(JSON.stringify(this._context || {}));
  }

  awaitingIO() {
    return [this._context.awaitingIO]
      .map(awaitingIO => typeof awaitingIO === 'undefined' ?
        awaitingIO :
        awaitingIO[Object.keys(awaitingIO)[0]])[0];
  }

  input(textOrId, value) {
    this._context.inputs = this._context.inputs || {};
    const awaitingIODef = this.awaitingIO();
    if (Object.keys(awaitingIODef).map(key => awaitingIODef[key]).indexOf(textOrId) > -1) {
      const inputKey = awaitingIODef.key;
      this._context.inputs[inputKey] = value;
      if (this._context.awaitingIO) {
        delete this._context.awaitingIO[inputKey];
      }
    }
    return this;
  }

  next() {
    const safeNextGraph = (nextObj, context) => {
      if (typeof nextObj === 'undefined') {
        return this;
      }
      this._context.visits[nextObj.id] = this._context.visits[nextObj.id] ? this._context.visits[nextObj.id] + 1 : 1;
      if (this._context.visits[nextObj.id] > 10) {
        throw new Error('Max recursion depth at ' + JSON.stringify(nextObj));
      }
      this._context.lastId = nextObj.id;
      const nextGraph = new GliffyRunner(this.diagram, nextObj.id, this._context);
      if (nextObj.id !== this.object.id || nextObj.type === 'decision') {
        return nextGraph.next();
      }
      return nextGraph;
    };
    let nextPositions = this.diagram.lines
      .filter(object => object.type === 'line' && object.startId === this.position)
      .map(line => line.endId)
      .map(endId => this.diagram.index[endId]);
    switch (this.object.type) {
      case 'decision':
        nextPositions = nextPositions.map(nextObject => {
          nextObject.condition = this.diagram.findEdge(this.position, nextObject.id);
          nextObject.result = eval(nextObject.condition.text.replace(/context/,'this._context'));
          return nextObject;
        });
        const trues = nextPositions.filter(nextObject => nextObject.result);
        const undefs = nextPositions.filter(nextObject => typeof nextObject.result === 'undefined');
        return safeNextGraph(trues.length > 0 ? trues[0] : undefs[0], this._context);
      case 'input':
        this._context.inputs = this._context.inputs || {};
        if (this._context.inputs.hasOwnProperty(this.object.inputKey)) {
          return safeNextGraph(nextPositions[0], this._context);
        } else {
          this._context.awaitingIO = this._context.awaitingIO || {};
          if(!this._context.awaitingIO.hasOwnProperty(this.object.inputKey)) {
            this._context.awaitingIO[this.object.inputKey] = {
              id: this.object.id,
              key: this.object.inputKey,
              text: this.object.ioType === 'display' ? eval(this.object.text.replace(/context/,'this._context')) : this.object.text,
              uuid: uuid.v4(),
              type: this.object.ioType
            };
          }
          return safeNextGraph(this.object, this._context);
        }
      case 'process':
        return safeNextGraph(nextPositions[0], this._context);
      default:
        return safeNextGraph(nextPositions[0], this._context);
    }
  }
}

const gliffyJson = gliffyJson => {
  const index = {};
  const groups = {};
  const makeKey = value => value.toLowerCase().replace(/[^a-z]+/ig, '_');
  const lines = [];
  const objects = gliffyJson.stage.objects.map(object => {
      object.type = flowType(object.uid);
      return object;
    })
    .filter(object => typeof object.type !== 'undefined')
    .sort((a, b) => {
      return a.x - b.x;
    })
    .map(object => {
      let isIOType = isIO(object.type);
      const flowObj = {
        id: object.id,
        type: isIOType ? 'input' : object.type,
        ioType: object.type,
        io: isIOType,
        text: (object.children || [])
          .reduce((text, child) => {
            if (child.graphic && child.graphic.Text) {
              text += ` ${ (child.graphic.Text.html || '')
                .replace(/(<([^>]+)>)/ig, '') }`;
            }
            return text;
          }, '').trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        group: [object].reduce((group, object) => {
          if (object.graphic &&
            object.graphic.Shape &&
            object.graphic.Shape.fillColor) {
            group = object.graphic.Shape.fillColor;
          }
          return group;
        }, 'default')
      };
      if (object.constraints
        && object.constraints.startConstraint
        && object.constraints.endConstraint) {
        flowObj.startId = object.constraints.startConstraint.StartPositionConstraint.nodeId;
        flowObj.endId = object.constraints.endConstraint.EndPositionConstraint.nodeId;
        lines.push(flowObj);
      }
      if (flowObj.io) {
        flowObj.inputKey = makeKey(flowObj.text);
      }
      if (flowObj.type === 'title') {
        groups[flowObj.group] = flowObj.text;
        groups[flowObj.group] = {
          title: flowObj.text,
          order: object.y,
          key: makeKey(flowObj.text)
        };
      }
      index[flowObj.id] = flowObj;
      return flowObj;
    }).filter(object => {
      return object.type !== 'title';
    }).map(object => {
      object.group = [groups[object.group]].map(group => group ? group.key : 'default')[0];
      return object;
    }).reduce((grouped, object) => {
      grouped[object.group] = grouped[object.group] || [];
      grouped[object.group].push(object);
      return grouped;
    }, {});
  const findEdge = (start, end) => {
    return lines.filter(object => object.type === 'line'
    && object.startId === start
    && object.endId === end)[0];
  };
  const graph = (objects, position, context) => {
    position = position || -1;
    context = JSON.parse(JSON.stringify(context || {visits: {}}));
    let object = position === -1 ? null : index[position];
    if (position === -1) {
      object = objects[0];
      position = object.id;
    }
    if ((object.type === 'process' || object.ioType === 'display') && !object.evald) {
      object.evald = true;
      eval(object.text);
    }
    context.curId = position;
    let instance = null;
    return instance = {
      context: () => {
        return JSON.parse(JSON.stringify(context || {}));
      },
      awaitingIO: () => {
        return [context.awaitingIO]
          .map(awaitingIO => typeof awaitingIO === 'undefined' ?
            awaitingIO :
            awaitingIO[Object.keys(awaitingIO)[0]])[0];
      },
      input: (textOrId, value) => {
        context.inputs = context.inputs || {};
        const awaitingIODef = instance.awaitingIO();
        if (Object.keys(awaitingIODef).map(key => awaitingIODef[key]).indexOf(textOrId) > -1) {
          const inputKey = awaitingIODef.key;
          context.inputs[inputKey] = value;
          if (context.awaitingIO) {
            delete context.awaitingIO[inputKey];
          }
        }
        return graph(objects, object.id, context);
      },
      next: () => {
        const safeNextGraph = (nextObj, context) => {
          if (typeof nextObj === 'undefined') {
            return graph(objects, object.id, context);
          }
          context.visits[nextObj.id] = context.visits[nextObj.id] ? context.visits[nextObj.id] + 1 : 1;
          if (context.visits[nextObj.id] > 10) {
            throw new Error('Max recursion depth at ' + JSON.stringify(nextObj));
          }
          context.lastId = nextObj.id;
          const nextGraph = graph(objects, nextObj.id, context);
          if (nextObj.id !== object.id || nextObj.type === 'decision') {
            return nextGraph.next();
          }
          return nextGraph;
        };
        let nextPositions = lines
          .filter(object => object.type === 'line' && object.startId === position)
          .map(line => line.endId)
          .map(endId => index[endId]);
        switch (object.type) {
          case 'decision':
            nextPositions = nextPositions.map(nextObject => {
              nextObject.condition = findEdge(position, nextObject.id);
              nextObject.result = eval(nextObject.condition.text);
              return nextObject;
            });
            const trues = nextPositions.filter(nextObject => nextObject.result);
            const undefs = nextPositions.filter(nextObject => typeof nextObject.result === 'undefined');
            return safeNextGraph(trues.length > 0 ? trues[0] : undefs[0], context);
          case 'input':
            context.inputs = context.inputs || {};
            if (context.inputs.hasOwnProperty(object.inputKey)) {
              return safeNextGraph(nextPositions[0], context);
            } else {
              context.awaitingIO = context.awaitingIO || {};
              if(!context.awaitingIO.hasOwnProperty(object.inputKey)) {
                context.awaitingIO[object.inputKey] = {
                  id: object.id,
                  key: object.inputKey,
                  text: object.ioType === 'display' ? eval(object.text) : object.text,
                  uuid: uuid.v4(),
                  type: object.ioType
                };
              }
              return safeNextGraph(object, context);
            }
          case 'process':
            return safeNextGraph(nextPositions[0], context);
          default:
            return safeNextGraph(nextPositions[0], context);
        }
      }
    };
  };
  const accessor = (group) => {
    group = makeKey(group || Object.keys(groups)
        .map(key => groups[key])
        .sort((a, b) => a.order - b.order)[0].key);
    return Object.assign(graph(objects[group]), {
      list: type => objects[group].filter(object => typeof type === 'undefined' || object.type === type),
      group: group => accessor(group)
    });
  };
  return accessor();
};

module.exports = {
  createGliffyDiagramFromJson: createGliffyDiagramFromJson,
  gliffyJson: gliffyJson,
  GliffyRunner: GliffyRunner
};

