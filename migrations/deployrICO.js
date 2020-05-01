var ReversibleICO = artifacts.require(“ReversibleICO”);
var ReversibleICOToken = artifacts.require(“ReversibleICOToken”);

module.exports = async function(deployer, network, accounts) {

    // deploy rICO
    let rICOInstance = await deployer.deploy(ReversibleICO);

    // deploy token
    let rICOTokenInstance = await deployer.deploy(ReversibleICOToken);


};