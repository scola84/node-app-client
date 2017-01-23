import 'dom-shims';

import { FastClick } from 'fastclick';
import { request } from 'https';

import {
  HttpConnection,
  WsConnection,
} from '@scola/api';

import {
  Auth,
  logIn
} from '@scola/auth-client';

import {
  i18n as i18nFactory,
  router as routerFactory,
  main as mainFactory,
  menu as menuFactory,
  model as modelFactory
} from '@scola/d3';

import { Reconnector } from '@scola/websocket';

export default class Client {
  constructor() {
    this._auth = null;
    this._codec = null;
    this._http = null;
    this._i18n = null;
    this._main = null;
    this._menus = new Map();
    this._router = null;
    this._user = null;
    this._ws = null;

    this._handleOnline = () => this._online();
    this._handleOpen = (e) => this._open(e);
    this._handleSetAuth = (e) => this._setAuth(e);

    FastClick.attach(document.body);
  }

  auth(options = null) {
    if (options === null) {
      return this._auth;
    }

    const model = modelFactory(options.name)
      .connection(this._ws || this._http);
      
    this._auth = new Auth().model(model);
    this._bindAuthModel();

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

  main(action = null, media = true) {
    if (action === null) {
      return this._main;
    }

    if (action === false) {
      this._main.destroy();
      this._main = null;
      return this;
    }

    this._main = mainFactory()
      .gesture(true);

    if (media === true) {
      this._main.media();
    }

    this._router.target('main').render((target) => {
      target.element(this._main.attach());
    });

    return this;
  }

  menu(name = null, position = null, mode = 'over', media = true) {
    if (name === null) {
      return this._menus;
    }

    let instance = this._menus.get(name);

    if (position === null) {
      return instance;
    }

    if (position === false) {
      this.main().append(instance, false);
      instance.destroy();
      this._menus.delete(name);
      return this;
    }

    instance = menuFactory()
      .gesture(true)
      .position(position)
      .mode(mode)
      .border()
      .reset();

    if (media === true) {
      instance.media();
    }

    this._menus.set(name, instance);
    this.main().append(instance);

    this._router.target(name).render((target) => {
      target.element(this._menus.get(target.name()));
    });

    return this;
  }

  router(options = null) {
    if (options === null) {
      return this._router;
    }

    const model = modelFactory(options.name);
    this._router = routerFactory().model(model);

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

    if (window.navigator.onLine === true) {
      this._reconnector.open();
    } else {
      logIn(this);
    }

    return this;
  }

  _bindAuthModel() {
    this._auth.model().on('set', this._handleSetAuth);
  }

  _unbindAuthModel() {
    this._auth.model().removeListener('set', this._handleSetAuth);
  }

  _bindWs() {
    window.addEventListener('online', this._handleOnline);
    this._reconnector.on('open', this._handleOpen);
  }

  _unbindWs() {
    window.removeEventListener('online', this._handleOnline);
    this._reconnector.removeListener('open', this._handleOpen);
  }

  _setAuth(event) {
    if (event.name !== 'auth') {
      return;
    }

    if (event.value === false) {
      this._menus.forEach((object, name) => {
        this._router.target(name).destroy('replace');
      });

      if (this._main) {
        this._router.target('main').destroy('replace');
        this._main.detach();
      }
    }
  }

  _online() {
    this._reconnector.open();
  }

  _open(event) {
    this._ws.open(event);
    logIn(this);
  }
}
