var ReversibleICO = artifacts.require("./ReversibleICO");
var ReversibleICOToken = artifacts.require("./ReversibleICOToken");

console.log(ReversibleICOToken);

module.exports = function(deployer, network, accounts) {

    console.log(accounts);

    // deploy rICO
    let rICOInstance = deployer.deploy(ReversibleICO);

    console.log(rICOInstance);

    // deploy token
    let rICOTokenInstance = deployer.deploy(ReversibleICOToken);


};