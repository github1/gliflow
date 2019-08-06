const fs = require('fs');
const gp = require('./gliffyParser.js');
const createGliffyDiagramFromJson = gp.createGliffyDiagramFromJson;
const GliffyRunner = gp.GliffyRunner;

describe('gliffyParser', () => {
  const gliffyJson = JSON.parse(fs.readFileSync('./gliffy-test.gliffy').toString('utf8'));
  describe('parsing shapes', () => {
    let graph = {};
    beforeEach(() => {
      graph = createGliffyDiagramFromJson(gliffyJson);
    });
    it('extracts the shapes as process types', () => {
      expect(graph.list('input').length).toEqual(1);
      expect(graph.list('process').length).toEqual(2);
      expect(graph.list('decision').length).toEqual(1);
    });
    it('extracts the text of each shape', () => {
      expect(graph.list('input')[0].text).toEqual('enter a number');
    });
  });
  describe('examples', () => {
    let graph = {};
    beforeEach(() => {
      graph = new GliffyRunner(createGliffyDiagramFromJson(gliffyJson));
    });
    describe('when accepting inputs', () => {
      it('stores the input in context for execution', () => {
        let g = graph.group('process-1')
          .next();
        expect(g.awaitingIO().text).toEqual('enter a number');
        g = g.input('enter_a_number', 1);
        expect(g.awaitingIO()).toBeUndefined();
        g = g.next();
        expect(g.context().data).toEqual(11);
      });
      it('has semantics for displaying output' , () => {
        let g = graph.group('output')
          .next();
        expect(g.awaitingIO().type).toEqual('display');
        expect(g.awaitingIO().text).toEqual('hello gobi');
        g = g.input(g.awaitingIO().uuid, 'blah').next(); // done displaying
        expect(g.awaitingIO().text).toEqual('goodbye');
        g = g.input(g.awaitingIO().uuid, 'blah').next(); // done displaying
        expect(g.awaitingIO()).toBeUndefined();
      });
      it('has semantics for accepting arbitrary input (non prompt)', () => {
        let g = graph.group('arbitrary-input')
          .next();
        expect(g.awaitingIO().type).toEqual('input');
        expect(g.awaitingIO().text).toEqual('get me some data');
        g = g.input(g.awaitingIO().uuid, 'some data');
        expect(g.awaitingIO()).toBeUndefined();
        g.next();
      });
    });
    describe('when a flow is recursive', () => {
      it('limits recursion', () => {
        // expect.assertions(1);
        // try {
        //   graph.group('max-recursion-prevention').next();
        // } catch (err) {
        //   expect(err.message).toMatch(/^Max recursion depth at/);
        // }
      });
    });
  });
});
