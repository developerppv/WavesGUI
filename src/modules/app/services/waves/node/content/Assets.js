(function () {
    'use strict';

    /**
     * @param {BaseNodeComponent} BaseNodeComponent
     * @param {app.utils} utils
     * @param {User} user
     * @param {EventManager} eventManager
     * @param {app.utils.decorators} decorators
     * @param {PollCache} PollCache
     * @return {Assets}
     */
    const factory = function (BaseNodeComponent, utils, user, eventManager, decorators, PollCache) {

        class Assets extends BaseNodeComponent {

            constructor() {
                super();
                user.onLogin().then(() => {
                    this._balanceCache = new PollCache({
                        getData: this._getBalances.bind(this),
                        timeout: 2000,
                        isBalance: true
                    });
                });
            }

            /**
             * Get Asset info
             * @param {string} assetId
             * @return {Promise<IAsset>}
             */
            @decorators.cachable()
            info(assetId) {
                return Waves.Asset.get(assetId);
            }

            /**
             * Get balance by asset id
             * @param {string} assetId
             * @return {Promise<IAssetWithBalance>}
             */
            balance(assetId) {
                return this.balanceList([assetId])
                    .then(([asset]) => asset);
            }

            /**
             * @param {string} query
             * @return {JQuery.jqXHR}
             */
            search(query) {
                return $.get(`https://api.wavesplatform.com/assets/search/${query}`, (data) => {
                    return data.map((item) => {
                        item.name = WavesApp.remappedAssetNames[item.id] || item.name;
                        return item;
                    });
                });
            }

            /**
             * Get balance list by asset id list
             * @param {string[]} assetIdList
             * @return {Promise<IAssetWithBalance[]>}
             */
            balanceList(assetIdList) {
                return utils.whenAll([
                    utils.whenAll(assetIdList.map(this.info, this)),
                    this._balanceCache.get()
                ])
                    .then(([assetList, balanceList]) => {
                        const balances = utils.toHash(balanceList, 'id');
                        return assetList.map((asset) => {
                            if (balances[asset.id]) {
                                const balance = this._getAssetBalance(balances[asset.id].amount);
                                if (balance.getTokens().lt(0)) {
                                    return Waves.Money.fromTokens('0', balance.asset.id).then((balance) => {
                                        return { ...asset, balance };
                                    });
                                } else {
                                    return utils.when({ ...asset, balance });
                                }
                            } else {
                                return Waves.Money.fromTokens('0', asset.id)
                                    .then((money) => ({ ...asset, balance: money }));
                            }
                        });
                    })
                    .then(utils.whenAll);
            }

            /**
             * Get balance list by user address
             * @return {Promise<IAssetWithBalance[]>}
             */
            userBalances() {
                return this._balanceCache.get()
                    .then((balanceList) => {
                        return utils.whenAll(balanceList.map((balance) => this.info(balance.id)))
                            .then((assetList) => {
                                return assetList.map((asset, index) => {
                                    const amount = balanceList[index].amount;
                                    const balance = this._getAssetBalance(amount);
                                    if (balance.getTokens().lt(0)) {
                                        return Waves.Money.fromTokens('0', balance.asset.id).then((balance) => {
                                            return { ...asset, balance };
                                        });
                                    } else {
                                        return { ...asset, balance };
                                    }
                                });
                            })
                            .then(utils.whenAll);
                    });
            }

            /**
             * Get list of min values fee
             * @param {string} type
             * @return {Promise<Money[]>}
             */
            fee(type) {
                return this._feeList(type);
            }

            /**
             * Create transfer transaction
             * @param {Money} amount
             * @param {Money} [fee]
             * @param {string} recipient
             * @param {string} attachment
             * @param {string} keyPair
             * @return {Promise<{id: string}>}
             */
            transfer({ amount, fee, recipient, attachment, keyPair }) {
                return this.getFee('transfer', fee)
                    .then((fee) => {
                        return Waves.API.Node.v1.assets.transfer({
                            amount: amount.toCoins(),
                            assetId: amount.asset.id,
                            fee: fee.toCoins(),
                            feeAssetId: fee.asset.id,
                            recipient,
                            attachment
                        }, keyPair)
                            .then(this._pipeTransaction([amount, fee]));
                    });
            }

            /**
             * Create issue transaction
             * @param {string} name
             * @param {string} description
             * @param {string} quantity count of tokens from new asset
             * @param {number} precision num in range from 0 to 8
             * @param {boolean} reissuable can reissue token
             * @param {Seed.keyPair} keyPair
             * @param {Money} [fee]
             * @return {Promise<ITransaction>}
             */
            issue({ name, description, quantity, precision, reissuable, fee, keyPair }) {
                return this.getFee('issue', fee).then((fee) => {
                    return Waves.API.Node.v1.assets.issue({
                        name,
                        description,
                        precision,
                        reissuable,
                        quantity,
                        fee
                    }, keyPair)
                        .then(this._pipeTransaction([fee]));
                });
            }

            /**
             * Create reissue transaction
             */
            reissue() {

            }

            /**
             * Create burn transaction
             */
            burn() {

            }

            distribution() {

            }

            /**
             * @return {Promise<IAssetWithBalance[]>}
             * @private
             */
            @decorators.cachable(1)
            _getBalances() {
                return Waves.API.Node.v2.addresses.balances(user.address);
            }

            /**
             * @param {Money} money
             * @return {Money}
             * @private
             */
            _getAssetBalance(money) {
                return eventManager.updateBalance(money);
            }

        }

        return new Assets();
    };

    factory.$inject = ['BaseNodeComponent', 'utils', 'user', 'eventManager', 'decorators', 'PollCache'];

    angular.module('app')
        .factory('assets', factory);
})();

/**
 * @typedef {object} IAssetWithBalance
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {number} precision
 * @property {BigNumber} balance
 * @property {boolean} reissuable
 * @property {Money} quantity
 * @property {number} timestamp
 * @property {number} height
 * @property {string} ticker
 * @property {string} sign
 */
