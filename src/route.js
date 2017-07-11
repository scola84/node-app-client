import { authorize } from '@scola/auth-client';

export default class Route {
  constructor() {
    this._client = null;

    this._authorize = null;
    this._path = null;
    this._renderer = null;
  }

  client(value) {
    this._client = value;
    return this;
  }

  authorize(value) {
    this._authorize = value;
    return this;
  }

  render(path, renderer) {
    this._path = path;
    this._renderer = renderer;

    return this;
  }

  open() {
    const handlers = [];

    this._addAuthorize(handlers);
    this._addRenderer(handlers);

    this._client
      .router()
      .render(
        this._path,
        ...handlers
      );
  }

  _addAuthorize(handlers) {
    if (this._authorize === null) {
      return;
    }

    handlers.push(authorize(this._authorize));
  }

  _addRenderer(handlers) {
    if (this._renderer === null) {
      return;
    }

    handlers.push(this._renderer);
  }
}
