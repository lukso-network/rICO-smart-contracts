const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect;

const signers = [
  accounts[0],
  accounts[1],
  accounts[2],
  accounts[3],
  accounts[4]
]; // accounts[0] maybe
const data = web3.utils.sha3("OZ777TestData");
const operatorData = web3.utils.sha3("OZ777TestOperatorData");
const anyone = "0x0000000000000000000000000000000000000001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const holder = accounts[10];
const manager = accounts[9];

const generateDeploymentCode = async function(name) {
  const ContractData = await helpers.utils.getAbiFile(name);
  return ContractData.bytecode;
};

describe("Gnosis Safe Integration", function() {
  before(async function() {});

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

      const deploymentDataToken = await generateDeploymentCode("RicoToken");
      const deploymentDataRico = await generateDeploymentCode("ReversableICO");

      let creationDataToken = this.CreateCall.methods
        .performCreate(0, deploymentDataToken)
        .encodeABI();

      let creationDataRico = this.CreateCall.methods
        .performCreate(0, deploymentDataRico)
        .encodeABI();

      console.log(
        await helpers.safeUtils.executeTransaction(
          this.GnosisSafe,
          this.GnosisSafe,
          "deploy Token",
          signers,
          helpers.addresses.CreateCall,
          "0",
          creationDataToken,
          1, //DELEGATECALL
          manager
        )
      );
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

      console.log(
        "      Gas used for deployment:",
        this.GnosisSafe.receipt.gasUsed
      );
      console.log(
        "      Contract Address:",
        this.GnosisSafe.receipt.contractAddress
      );
      console.log("");
      helpers.addresses.GnosisSafe = this.GnosisSafe.receipt.contractAddress;
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
