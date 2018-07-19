/* global WebStorage */
(function () {
    'use strict';

    let read;
    let write;
    let clear;
    const tsUtils = require('ts-utils');

    if (WavesApp.isWeb()) {
        try {
            localStorage.setItem('___test', String(Date.now()));
        } catch (e) {
            const storage = {
                _data: Object.create(null),
                get length() {
                    return Object.keys(this._data).length;
                },
                key(n) {
                    return Object.keys(this._data)[n];
                },
                setItem(name, value) {
                    this._data[name] = String(value);
                },
                removeItem(key) {
                    delete this._data[key];
                },
                getItem(name) {
                    if (name in this._data) {
                        return this._data[name];
                    } else {
                        return null;
                    }
                },
                clear() {
                    this._data = Object.create(null);
                }
            };
            Object.defineProperty(window, 'localStorage', {
                get: () => storage
            });
        }
        read = function (key) {
            const data = localStorage.getItem(key);
            try {
                return Promise.resolve(JSON.parse(data));
            } catch (e) {
                return Promise.resolve(data);
            }
        };
        write = function (key, value) {
            localStorage.setItem(key, value);
            return Promise.resolve();
        };
        clear = function () {
            localStorage.clear();
            return Promise.resolve();
        };
    } else {
        read = function (key) {
            return WebStorage.readStorage(key).then((result) => {
                try {
                    return JSON.parse(result);
                } catch (e) {
                    return result;
                }
            });
        };
        write = function (key, value) {
            return WebStorage.writeStorage(key, value);
        };
        clear = function () {
            return WebStorage.clearStorage();
        };
    }

    /**
     * @param {$q} $q
     * @param {app.utils} utils
     * @param {Migration} migration
     * @param {State} state
     */
    const factory = function ($q, utils, migration, state) {

        const MIGRATION_MAP = {
            '1.0.0': function (storage) {
                return storage.load('Wavesmainnet').then((data) => {
                    if (!data) {
                        return null;
                    }

                    const userList = data.accounts.map((account) => {
                        return {
                            address: account.address,
                            encryptedSeed: account.cipher,
                            settings: {
                                encryptionRounds: 1000
                            }
                        };
                    });
                    return storage.clear().then(() => storage.save('userList', userList));
                });
            },
            '1.0.0-beta.23': function (storage) {
                return storage.load('userList').then((list = []) => {
                    const newList = list.map((item) => {
                        tsUtils.set(item, 'settings.lastOpenVersion', '1.0.0-beta.22');
                        return item;
                    });
                    return storage.save('userList', newList);
                });
            },
            '1.0.0-beta.35': function (storage) {
                return addNewGateway(storage, WavesApp.defaultAssets.DASH);
            },
            '1.0.0-beta.40': function (storage) {
                return addNewGateway(storage, WavesApp.defaultAssets.XMR);
            },
            '1.0.0-beta.47': function (storage) {
                return storage.load('userList').then((list = []) => {
                    const result = list.map((item) => {
                        tsUtils.unset(item, 'settings.dex');
                        return item;
                    });
                    return storage.save('userList', result);
                });
            }
        };

        function addNewGateway(storage, gateway) {
            return storage.load('userList').then((users = []) => {
                users.forEach((user) => {
                    const settings = user.settings || Object.create(null);
                    const idList = settings.pinnedAssetIdList;
                    if (idList && !idList.includes(gateway)) {
                        idList.push(gateway);
                    }
                });

                return storage.save('userList', users);
            });
        }

        class Storage {

            constructor() {
                this._isNewDefer = $q.defer();

                this.load('lastVersion')
                    .then((version) => {
                        this.save('lastVersion', WavesApp.version);
                        state.lastOpenVersion = version;

                        if (version) {
                            const versions = migration.migrateFrom(version, Object.keys(MIGRATION_MAP));
                            return utils.chainCall(versions.map((version) => MIGRATION_MAP[version].bind(null, this)))
                                .then(() => {
                                    this._isNewDefer.resolve(version);
                                });
                        } else {
                            this._isNewDefer.resolve(version);
                            return Promise.resolve();
                        }
                    });
            }

            onReady() {
                return this._isNewDefer.promise;
            }

            save(key, value) {
                return utils.when(write(key, Storage.stringify(value)));
            }

            load(key) {
                return utils.when(read(key))
                    .then((data) => Storage.myParse(data));
            }

            clear() {
                return utils.when(clear());
            }

            static stringify(data) {
                switch (typeof data) {
                    case 'string':
                        return data;
                    case 'object':
                        try {
                            return JSON.stringify(data);
                        } catch (e) {
                            return String(data);
                        }
                    default:
                        return String(data);
                }
            }

            static myParse(data) {
                return data;
            }

        }

        return new Storage();
    };

    factory.$inject = ['$q', 'utils', 'migration', 'state'];

    angular.module('app.utils')
        .factory('storage', factory);
})();
