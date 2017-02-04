import 'dom-shims';

import { EventEmitter } from 'events';
import { FastClick } from 'fastclick';
import { request } from 'https';

import {
  HttpConnection,
  WsConnection,
  load as loadApi
} from '@scola/api';

import {
  Auth,
  logIn,
  logOut,
  load as loadAuth
} from '@scola/auth-client';

import {
  i18n as i18nFactory,
  router as routerFactory,
  main as mainFactory,
  menu as menuFactory,
  model as modelFactory
} from '@scola/d3';

import { load as loadValidator } from '@scola/validator';
import { Reconnector } from '@scola/websocket';

export default class Client extends EventEmitter {
  constructor() {
    super();

    this._auth = null;
    this._codec = null;
    this._http = null;
    this._i18n = null;
    this._mainModifier = null;
    this._menuModifiers = new Map();
    this._router = null;
    this._user = null;
    this._ws = null;

    this._handleError = (e) => this._error(e);
    this._handleMain = (t) => this._main(t);
    this._handleMenu = (t) => this._menu(t);
    this._handleOnline = () => this._online();
    this._handleOpen = (e) => this._open(e);
    this._handleSetAuth = (e) => this._setAuth(e);

    FastClick.attach(document.body);
  }

  destroy() {
    this._unbindAuth();
    this._unbindRouter();
    this._unbindWs();
  }

  auth(options = null) {
    if (options === null) {
      return this._auth;
    }

    const model = modelFactory(options.name)
      .connection(this._ws || this._http);

    this._auth = new Auth().model(model);
    this._bindAuth();

    return this;
  }

  codec(value = null) {
    if (value === null) {
      return this._codec;
    }

    this._codec = value;

    if (this._ws) {
      this._ws.codec(value);
    }

    return this;
  }

  http(options = null) {
    if (options === null) {
      return this._http;
    }

    this._http = new HttpConnection()
      .http({ request })
      .codec(this.codec())
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

  main(modifier = (e) => e.media()) {
    this._mainModifier = modifier;
    this._router.target('main').render(this._handleMain);
    return this;
  }

  menu(name, modifier = (e) => e.media()) {
    this._menuModifiers.set(name, modifier);
    this._router.target(name).render(this._handleMenu);
    return this;
  }

  router(options = null) {
    if (options === null) {
      return this._router;
    }

    const model = modelFactory(options.name);
    this._router = routerFactory().model(model);
    this._bindRouter();

    return this;
  }

  user(value = null) {
    if (value === null) {
      return this._user;
    }

    this._user = value;

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
    if (this._ws) {
      return this._ws;
    }

    this._reconnector = new Reconnector()
      .url('wss://' + options.host + ':' + options.port)
      .class(WebSocket);

    this._ws = new WsConnection()
      .auto(false)
      .router(this.router())
      .codec(this.codec());

    this._bindWs();
    return this;
  }

  start() {
    loadApi(this);
    loadValidator(this);

    if (this._auth) {
      loadAuth(this);
    }

    if (window.navigator.onLine === true) {
      this._reconnector.open();
    } else if (this._auth) {
      logIn(this);
    }

    return this;
  }

  _bindAuth() {
    if (this._auth) {
      this._auth.model().on('set', this._handleSetAuth);
    }
  }

  _unbindAuth() {
    if (this._auth) {
      this._auth.model().removeListener('set', this._handleSetAuth);
    }
  }

  _bindRouter() {
    if (this._router) {
      this._router.on('error', this._handleError);
    }
  }

  _unbindRouter() {
    if (this._router) {
      this._router.removeListener('error', this._handleError);
    }
  }

  _bindWs() {
    if (this._reconnector) {
      window.addEventListener('online', this._handleOnline);
      this._reconnector.on('open', this._handleOpen);
      this._reconnector.on('error', this._handleError);
    }
  }

  _unbindWs() {
    if (this._reconnector) {
      window.removeEventListener('online', this._handleOnline);
      this._reconnector.removeListener('open', this._handleOpen);
      this._reconnector.removeListener('error', this._handleError);
    }
  }

  _setAuth(event) {
    if (event.name !== 'auth') {
      return;
    }

    if (event.value === false) {
      if (this._mainModifier) {
        this._router.target('main').destroy('replace');
      }
    }
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
      .gesture(true);

    element = this._mainModifier(element);
    const menus = Array.from(this._menuModifiers.keys());

    function handleDestroy() {
      target.removeListener('destroy', handleDestroy);

      element.hide(() => {
        element.destroy();
        target.routes(false);

        menus.forEach((name) => {
          target.router().target(name).destroy('replace');
        });
      });
    }

    function construct() {
      menus.forEach((name) => {
        if (target.router().target(name).element()) {
          element.append(target.router().target(name).element());
        }
      });

      document.body.appendChild(element.root().node());
      element.show();

      target.on('destroy', handleDestroy);
      target.element(element);
    }

    construct();
  }

  _menu(target) {
    const modifier = this._menuModifiers.get(target.name());

    let element = menuFactory()
      .gesture(true)
      .position('left')
      .mode('over');

    element = modifier(element);

    element
      .border()
      .reset();

    function handleDestroy() {
      element.destroy();
      target.routes(false);
    }

    function construct() {
      const main = target.router().target('main').element();

      if (main) {
        main.append(element);
      }

      target.once('destroy', handleDestroy);
      target.element(element);
    }

    construct();
  }

  _online() {
    this._reconnector.open();
  }

  _open(event) {
    this._ws.open(event);

    if (this._auth) {
      logIn(this);
    } else {
      this._router.popState();
    }
  }
}
