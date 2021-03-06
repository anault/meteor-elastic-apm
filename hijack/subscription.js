function start(apm){
  const Fiber = require('fibers');

  function wrapSubscription(subscriptionProto) {
    // If the ready event runs outside the Fiber, Kadira._getInfo() doesn't work.
    // we need some other way to store kadiraInfo so we can use it at ready hijack.
    var originalRunHandler = subscriptionProto._runHandler;
    subscriptionProto._runHandler = function() {
      //FIXME: I hope that this is the same transaction from './session.js' L52
      const transaction = apm.currentTransaction;
      if (transaction) {
        this.__transaction = transaction;
      };
      originalRunHandler.call(this);
    }

    const originalReady = subscriptionProto.ready;
    subscriptionProto.ready = function() {
      const transaction = this.__transaction;
      if(transaction){
        if(transaction.__span){
          transaction.__span.end();
        }
        transaction.end();
        this.__transaction = null;
      }

      originalReady.call(this);
    };
    //
    var originalError = subscriptionProto.error;
    subscriptionProto.error = function(err) {
      if (err) {
        // I hope that this is the same transaction from './session.js' L52
        const transaction = this.__transaction;
        if(transaction){
          if(transaction.__span){
            transaction.__span.end();
          }
          apm.captureError(err);
          transaction.end();
        }

        originalError.call(this, err);
      }
    };

    //tracking the pub/sub operations
    ['added', 'changed', 'removed'].forEach(function(funcName) {
      const originalFunc = subscriptionProto[funcName];
      subscriptionProto[funcName] = function(collectionName, id, fields) {

        const transaction = apm.startTransaction(`${collectionName}:${funcName}`, "sub - operations");
        const res = originalFunc.call(this, collectionName, id, fields);

        transaction.end(JSON.stringify(fields));
        return res;
      };
    });
  };

  wrapSubscription(MeteorX.Subscription.prototype);
}

module.exports = start;
