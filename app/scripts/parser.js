import _ from "underscore";
import PEG from "pegjs/lib/peg";
import DISPATCHER from "./pubsub";


export var INTENT = {
    PLACE_ORDER: "PLACE_ORDER",
    GREETING: "GREETING",
    UPDATE_INFO: "UPDATE_INFO",
    CONFIRM: "CONFIRM",
    DENY: "DENY",
    GET_ATTENTION: "GET_ATTENTION"
};

export var ORDER_SIDE = {
    BUYING: "BUYING",
    SELLING: "SELLING"
};

function parseTree(tree, result) {
    // Recursively walk down the tree
    if (result === undefined) {
        var result = {};
    }

    _.chain(tree).filter().each((node) => {
        var nodeType = node[0];

        if (nodeType === "V") {
            if (_.contains(["mua", "ban"], node[1])) {
                result.intent = INTENT.PLACE_ORDER;
                result.side = {
                    "mua": ORDER_SIDE.BUYING,
                    "ban": ORDER_SIDE.SELLING
                }[node[1]];
            } else if (node[1] === "chao") {
                result.intent = INTENT.GREETING;
            }
        }

        if (nodeType === "STOCK") {
            result.symbol = node[1];
        }

        if (nodeType === "PRICE") {
            result.price = node[1];
        }

        if (nodeType === "NUMBER") {
            result.amount = node[1];
        }

        if (nodeType === "YES") {
            result.intent = INTENT.CONFIRM;
        }

        if (nodeType === "NO") {
            result.intent = INTENT.DENY;
        }

        if (nodeType === "CALLING") {
            result.intent = INTENT.GET_ATTENTION;
        }

        if (_.isArray(node)) {
            parseTree(node, result);
        }
    });

    if (result.intent === undefined) {
        result.intent = INTENT.UPDATE_INFO;
    }

    return result;
}

Promise.all([
    $.get("/scripts/grammar.txt"),
    // $.get("http://125.212.207.68/priceservice/company/snapshot")
]).then((values) => {
    var symbolInfos = values[1];

    // var codes = _.pluck(symbolInfos, "code");
    var codes = ["VND", "ACB"];
    var grammar = _.template(values[0])({ stockSymbols: '"' + codes.join('" / "') + '"' });

    // TODO: this line takes a looooooooooooong time to finish!
    var parser = PEG.buildParser(grammar);
    DISPATCHER.publish("/parser/ready");

    DISPATCHER.subscribe("/human", (payload) => {
        try {
            var tree = parser.parse(payload.message);
            var result = parseTree(tree);
            DISPATCHER.publish("/processed", {
                status: "ok",
                message: result,
            });
        } catch (e) {
            DISPATCHER.publish("/processed", {
                status: "parse-error",
                message: e,
            });
        }
    });
});
