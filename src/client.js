import 'dom-shims/shim/CustomEvent';
import 'dom-shims/shim/Element.mutation';
import 'es6-shim';
import es7 from 'es7-shim';

import { EventEmitter } from 'events';
import { FastClick } from 'fastclick';
import { request } from 'https';
import get from 'lodash-es/get';

import {
  HttpConnection,
  PubSub,
  WsConnection,
  dictionary,
  load as loadApi
} from '@scola/api';

import {
  Auth,
  setUser,
  logIn,
  logOut,
  load as loadAuth
} from '@scola/auth-client';

import {
  cache as cacheFactory,
  i18n as i18nFactory,
  router as routerFactory,
  main as mainFactory,
  menu as menuFactory,
  model as modelFactory
} from '@scola/d3';

import { ScolaError } from '@scola/error';
import { load as loadValidator } from '@scola/validator';
import Route from './route';

export default class Client extends EventEmitter {
  constructor() {
    super();

    this._auth = null;
    this._config = null;
    this._http = null;
    this._i18n = null;
    this._pubsub = null;
    this._router = null;
    this._storage = null;
    this._user = null;
    this._ws = null;

    this._mainModifier = null;
    this._menuModifiers = new Map();

    this._state = {
      auth: false,
      open: false
    };

    this._fastClick = FastClick.attach(document.body);

    this._handleClose = () => this._close();
    this._handleError = (e) => this._error(e);
    this._handleMain = (t) => this._main(t);
    this._handleMenu = (t) => this._menu(t);
    this._handleOnline = () => this._online();
    this._handleOpen = (e) => this._open(e);
    this._handleSetAuth = (e) => this._setAuth(e);
  }

  destroy() {
    this._fastClick.destroy();

    this._unbindAuth();
    this._unbindRouter();
    this._unbindWs();
  }

  state(name, value = null) {
    if (value === null) {
      return typeof this._state[name] === 'undefined' ?
        null : this._state[name];
    }

    this._state[name] = value;
    this.emit(name, value);

    return this;
  }

  auth(options = null) {
    if (options === null) {
      return this._auth;
    }

    const model = modelFactory(options.name, true)
      .connection(this._ws || this._http)
      .serialize((d) => this._serializeAuth(d));

    const cache = cacheFactory()
      .model(model);

    this._auth = new Auth()
      .cache(cache);

    this._bindAuth();
    return this;
  }

  config(value = null) {
    if (value === null) {
      return this._config;
    }

    if (typeof value === 'string') {
      return get(this._config, value);
    }

    this._config = value;
    return this;
  }

  error(message) {
    return new ScolaError(message);
  }

  http(options = null) {
    if (options === null) {
      return this._http;
    }

    this._http = new HttpConnection()
      .http({ request })
      .codec(options.codec)
      .host(options.host)
      .port(options.port);

    return this;
  }

  i18n(options = null) {
    if (options === null) {
      return this._i18n;
    }

    this._i18n = i18nFactory()
      .locale(options.locale)
      .timezone(options.timezone);

    return this;
  }

  main(modifier = (e) => e.size()) {
    this._mainModifier = modifier;
    this._router.target('main').render(this._handleMain);

    return this;
  }

  menu(name, modifier = (e) => e.size()) {
    this._menuModifiers.set(name, modifier);
    this._router.target(name).render(this._handleMenu);

    return this;
  }

  pubsub(options = null) {
    if (this._pubsub === null) {
      this._pubsub = new PubSub();
    }

    if (options === null) {
      return this._pubsub;
    }

    if (options === true) {
      this._pubsub.connection(this._ws);
      return this;
    }

    options.factory = (u, p) => {
      return new WebSocket(u, p);
    };

    const connection = new WsConnection()
      .codec(options.codec)
      .reconnector(options);

    this._pubsub.connection(connection);
    return this;
  }

  route() {
    return new Route()
      .client(this);
  }

  router(options = null) {
    if (options === null) {
      return this._router;
    }

    const model = modelFactory(options.name, true);
    this._router = routerFactory().model(model);

    this._bindRouter();
    return this;
  }

  storage(value = null) {
    if (value === null) {
      return this._storage;
    }

    this._storage = value;
    return this;
  }

  user(value = null) {
    if (value === null) {
      return this._user;
    }

    this._user = value === false ?
      null : value;

    if (this._ws) {
      this._ws.user(value);
    }

    if (this._http) {
      this._http.user(value);
    }

    if (this._router) {
      this._router.user(value);
    }

    return this;
  }

  ws(options = null) {
    if (options === null) {
      return this._ws;
    }

    options = Object.assign({}, options);

    options.dictionary = options.dictionary || dictionary;
    options.factory = (u, p) => {
      return new WebSocket(u, p);
    };

    this._ws = new WsConnection()
      .codec(options.codec)
      .dictionary(options.dictionary)
      .reconnector(options);

    this._bindWs();
    return this;
  }

  start() {
    es7.shim();

    loadApi(this);
    loadValidator(this);

    if (this._pubsub) {
      this._pubsub.open();
    }

    if (this._auth === null) {
      this._popState();
      return this;
    }

    loadAuth(this);
    setUser(this, () => this._popState());

    return this;
  }

  _bindAuth() {
    if (this._auth) {
      this.setMaxListeners(this.getMaxListeners() + 1);
      this.on('auth', this._handleSetAuth);
    }
  }

  _unbindAuth() {
    if (this._auth) {
      this.setMaxListeners(this.getMaxListeners() - 1);
      this.removeListener('auth', this._handleSetAuth);
    }
  }

  _bindRouter() {
    if (this._router) {
      this._router.setMaxListeners(this._router.getMaxListeners() + 1);
      this._router.on('error', this._handleError);
    }
  }

  _unbindRouter() {
    if (this._router) {
      this._router.setMaxListeners(this._router.getMaxListeners() - 1);
      this._router.removeListener('error', this._handleError);
    }
  }

  _bindWs() {
    if (this._ws) {
      window.addEventListener('online', this._handleOnline);
      this._ws.setMaxListeners(this._ws.getMaxListeners() + 1);
      this._ws.on('close', this._handleClose);
      this._ws.on('error', this._handleError);
      this._ws.on('open', this._handleOpen);
    }
  }

  _unbindWs() {
    if (this._ws) {
      window.removeEventListener('online', this._handleOnline);
      this._ws.setMaxListeners(this._ws.getMaxListeners() - 1);
      this._ws.removeListener('close', this._handleClose);
      this._ws.removeListener('error', this._handleError);
      this._ws.removeListener('open', this._handleOpen);
    }
  }

  _popState() {
    const filter = this._user === null ? ['scola.auth'] : null;

    this._router.popState(filter);

    if (this._ws) {
      if (window.navigator.onLine === true) {
        this._ws.open();
      }
    }
  }

  _setAuth(value) {
    if (value !== 'valid' && this._mainModifier) {
      this._router.target('main').destroy();
    }
  }

  _serializeAuth(data) {
    return {
      token: data.user.token
    };
  }

  _error(error) {
    if (error.status === 500) {
      return;
    }

    if (error.status === 401 || error.status === 403) {
      logOut(this);
      return;
    }

    this.emit('error', error);
  }

  _main(target) {
    let element = mainFactory()
      .mode('over');

    element = this._mainModifier(element);
    const menus = Array.from(this._menuModifiers.keys());

    menus.forEach((name) => {
      const menu = target
        .router()
        .target(name)
        .element();

      if (menu !== null) {
        element.append(menu);
      }
    });

    document.body.appendChild(element.root().node());
    element.show(true);

    target
      .element(element)
      .once('destroy', () => {
        element.show(false).on('end', () => {
          element.destroy();
          target.routes(false);

          menus.forEach((name) => {
            target
              .router()
              .target(name)
              .destroy();
          });
        });
      });
  }

  _menu(target) {
    const modifier = this._menuModifiers.get(target.name());

    let element = menuFactory()
      .position('left');

    element = modifier(element);

    const main = target
      .router()
      .target('main')
      .element();

    if (main !== null) {
      main.append(element);
    }

    target
      .element(element)
      .once('destroy', () => {
        element.destroy();
        target.routes(false);
      });
  }

  _close() {
    this.state('open', false);
  }

  _online() {
    if (this._ws) {
      this._ws.open();
    }
  }

  _open() {
    this.state('open', true);

    if (this._auth) {
      logIn(this);
    }
  }
}
