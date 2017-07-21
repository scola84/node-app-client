import { authorize } from '@scola/auth-client';

export default class Route {
  constructor() {
    this._client = null;

    this._allow = [];
    this._authorize = [];
    this._default = false;
    this._path = null;
    this._renderer = null;
  }

  client(value) {
    this._client = value;
    return this;
  }

  authorize(value) {
    this._authorize.push(value);
    return this;
  }

  allow(value) {
    this._allow.push(value);
    return this;
  }

  default () {
    this._default = true;
    return this;
  }

  render(path, renderer) {
    this._path = path;
    this._renderer = renderer;

    return this._open();
  }

  _open() {
    const handlers = [];

    this._addAllow(handlers);
    this._addAuthorize(handlers);
    this._addRenderer(handlers);

    const route = this._client
      .router()
      .render(
        this._path,
        ...handlers
      );

    if (this._default === true) {
      route.default();
    }

    return route;
  }

  _addAllow(handlers) {
    if (this._allow === null) {
      return;
    }

    this._allow.forEach((handler) => {
      handlers.push(authorize(handler));
    });
  }

  _addAuthorize(handlers) {
    if (this._authorize === null) {
      return;
    }

    this._authorize.forEach((handler) => {
      handlers.push(handler);
    });
  }

  _addRenderer(handlers) {
    if (this._renderer === null) {
      return;
    }

    handlers.push(this._renderer);
  }
}
