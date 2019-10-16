const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect;
const lightwallet = require("eth-lightwallet");
const util = require("util");

let signers;
let safeAccounts;
const anyone = "0x0000000000000000000000000000000000000001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const holder = accounts[10];
const manager = accounts[9];

const generateDeploymentCode = async function(name, arguments) {
  const ContractData = await helpers.utils.getAbiFile(name);
  const deployArguments = {
    data: ContractData.bytecode,
    arguments: arguments
  };
  const ContractInstance = await new helpers.web3Instance.eth.Contract(
    ContractData.abi,
    "0x0000000000000000000000000000000000000000"
  )
    .deploy(deployArguments)
    .encodeABI();

  return ContractInstance;
};

async function createLightwallet() {
  // Create lightwallet accounts
  const createVault = util
    .promisify(lightwallet.keystore.createVault)
    .bind(lightwallet.keystore);
  const keystore = await createVault({
    hdPathString: "m/44'/60'/0'/0",
    seedPhrase:
      "pull rent tower word science patrol economy legal yellow kit frequent fat",
    password: "test",
    salt: "testsalt"
  });
  const keyFromPassword = await util
    .promisify(keystore.keyFromPassword)
    .bind(keystore)("test");
  keystore.generateNewAddress(keyFromPassword, 5);
  return {
    keystore: keystore,
    accounts: keystore.getAddresses(),
    passwords: keyFromPassword
  };
}

describe("Gnosis Safe Integration", function() {
  before(async function() {
    safeAccounts = await createLightwallet();
    signers = safeAccounts.accounts;
  });

  describe("Deployment", function() {
    before(async function() {
      this.GnosisSafe = await helpers.utils.deployNewContractInstance(
        helpers,
        "GnosisSafe",
        {
          from: manager,
          gas: 6500000,
          gasPrice: helpers.solidity.gwei * 10
        }
      );

      helpers.addresses.GnosisSafe = this.GnosisSafe.receipt.contractAddress;
      this.CreateCall = await helpers.utils.deployNewContractInstance(
        helpers,
        "CreateCall",
        {
          from: manager,
          gas: 6500000,
          gasPrice: helpers.solidity.gwei * 10
        }
      );

      helpers.addresses.CreateCall = this.CreateCall.receipt.contractAddress;

      const deploymentDataToken = await generateDeploymentCode("RicoToken", [
        setup.settings.token.supply.toString(),
        []
      ]);
      const deploymentDataRico = await generateDeploymentCode("MathMock");

      let creationDataToken = this.CreateCall.methods
        .performCreate(0, deploymentDataToken)
        .encodeABI();

      let creationDataRico = this.CreateCall.methods
        .performCreate(0, deploymentDataRico)
        .encodeABI();

      await helpers.web3.eth.sendTransaction({
        from: manager,
        to: helpers.addresses.GnosisSafe,
        value: "10000000000000000000"
      });

      await this.GnosisSafe.methods
        .setup(
          signers,
          4,
          ZERO_ADDRESS,
          "0x",
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          0,
          ZERO_ADDRESS
        )
        .send({ from: manager });

      await helpers.safeUtils.executeTransaction(
        safeAccounts,
        this.GnosisSafe,
        "deploy Token",
        signers,
        helpers.addresses.CreateCall,
        "0",
        creationDataToken,
        1, //DELEGATECALL
        manager
      );

      await helpers.safeUtils.executeTransaction(
        safeAccounts,
        this.GnosisSafe,
        "deploy Token",
        signers,
        helpers.addresses.CreateCall,
        "0",
        creationDataRico,
        1, //DELEGATECALL
        manager
      );

      console.log(
        "      Gas used for deployment:",
        this.GnosisSafe.receipt.gasUsed
      );
      console.log(
        "      Contract Address:",
        this.GnosisSafe.receipt.contractAddress
      );
      console.log("");
    });

    it("Gas usage should be lower than 6.7m.", function() {
      expect(this.GnosisSafe.receipt.gasUsed).to.be.below(6700000);
    });

    it("Correclty Sets Up", async function() {
      it("returns the signers", async function() {
        expect(await this.GnosisSafe.methods.getOwners().call()).to.deep.equal(
          signers
        );
      });
      it("returns the threshold", async function() {
        expect(await this.GnosisSafe.methods.getThreshold().call()).to.be.equal(
          4
        );
      });
    });
  });
});
