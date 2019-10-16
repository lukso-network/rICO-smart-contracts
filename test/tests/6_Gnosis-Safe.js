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
      const deploymentDataRico = await generateDeploymentCode(
        "ReversableICOMock777"
      );

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

      let tx1 = await helpers.safeUtils.executeTransaction(
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

      let tx2 = await helpers.safeUtils.executeTransaction(
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

      helpers.addresses.RicoToken =
        tx1.events.ContractCreation.returnValues.newContract;
      helpers.addresses.Rico =
        tx2.events.ContractCreation.returnValues.newContract;

      this.RicoToken = await helpers.utils.getContractInstance(
        helpers,
        "RicoToken",
        helpers.addresses.RicoToken
      );

      this.Rico = await helpers.utils.getContractInstance(
        helpers,
        "ReversableICO",
        helpers.addresses.Rico
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
          "4"
        );
      });
    });

    it("Correclty Deploys contracts through wallet", async function() {
      it("returns the correct manager for token", async function() {
        expect(await this.RicoToken.methods.manager().call()).to.deep.equal(
          this.addresses.GnosisSafe
        );
      });
      it("Wallet has the correct balance", async function() {
        expect(await this.RicoToken.methods.balanceOf().call()).to.be.equal(
          setup.settings.token.sale
        );
      });
      it("returns the correct deployer for Rico", async function() {
        expect(await this.Rico.methods.deployerAddress().call()).to.be.equal(
          this.addresses.GnosisSafe
        );
      });

      it("returns the freezed status", async function() {
        expect(await this.RicoToken.methods.freezed().call()).to.be.equal(true);
      });
    });

    it("Correctly setup Token and Rico", async function() {
      it("Setups rICO and Manager", async function() {
        let setupData = this.RicoToken.methods
          .setup(helpers.addresses.Rico, helpers.addresses.GnosisSafe)
          .encodeABI();
        await helpers.safeUtils.executeTransaction(
          safeAccounts,
          this.GnosisSafe,
          "Setup Rico",
          signers,
          helpers.addresses.RicoToken,
          "0",
          setupData,
          0, //CALL
          manager
        );
        expect(await this.RicoToken.methods.rICO().call()).to.be.equal(
          helpers.addresses.Rico
        );
      });
      it("Can transfer tokens to the Rico Contract", async function() {
        let transferData = this.RicoToken.methods
          .transfer(
            helpers.addresses.Rico,
            setup.settings.token.sale.toString()
          )
          .encodeABI();

        await helpers.safeUtils.executeTransaction(
          safeAccounts,
          this.GnosisSafe,
          "Move Tokens",
          signers,
          helpers.addresses.RicoToken,
          "0",
          transferData,
          0, //CALL
          manager
        );
        //This will fail for now because this method isn'timplemented on Rico itself
        expect(
          await this.RicoToken.methods.balanceOf(helpers.addresses.Rico).call()
        ).to.be.equal(setup.settings.token.sale.toString());
      });
      it("Can add settings to Rico Contract", async function() {
        const blocksPerDay = 6450;
        currentBlock = await this.ReversableICO.methods
          .getCurrentBlockNumber()
          .call();

        // starts in one day
        StartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 22 days allocation
        AllocationBlockCount = blocksPerDay * 22;
        AllocationPrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * 30;
        StagePriceIncrease = helpers.solidity.ether * 0.0001;

        // override for easy dev.. remove later
        /*
        StartBlock = 100;
        AllocationBlockCount = 100; 
        StageBlockCount = 100;
        */

        AllocationEndBlock = StartBlock + AllocationBlockCount;

        // for validation
        EndBlock = AllocationEndBlock + (StageBlockCount + 1) * StageCount;

        const StageStartBlock = AllocationEndBlock;
        let lastStageBlockEnd = StageStartBlock;

        for (let i = 0; i < StageCount; i++) {
          const start_block = lastStageBlockEnd + 1;
          const end_block = lastStageBlockEnd + StageBlockCount + 1;
          const token_price = AllocationPrice + StagePriceIncrease * (i + 1);

          stageValidation.push({
            start_block: start_block,
            end_block: end_block,
            token_price: token_price
          });

          lastStageBlockEnd = end_block;
        }
        let settingsData = this.Rico.methods
          .addSettings(
            TokenTrackerAddress, // address _TokenTrackerAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            TeamWalletAddress, // address _TeamWalletAddress
            StartBlock, // uint256 _StartBlock
            AllocationBlockCount, // uint256 _AllocationBlockCount,
            AllocationPrice, // uint256 _AllocationPrice in wei
            StageCount, // uint8   _StageCount
            StageBlockCount, // uint256 _StageBlockCount
            StagePriceIncrease // uint256 _StagePriceIncrease in wei
          )
          .encodeABI();

        await helpers.safeUtils.executeTransaction(
          safeAccounts,
          this.GnosisSafe,
          "Move Tokens",
          signers,
          helpers.addresses.Rico,
          "0",
          settingsData,
          0, //CALL
          manager
        );
        expect(
          await this.ReversableICO.methods.initialized().call()
        ).to.be.equal(true);
        expect(await this.ReversableICO.methods.running().call()).to.be.equal(
          false
        );

        expect(await this.ReversableICO.methods.frozen().call()).to.be.equal(
          false
        );

        expect(await this.ReversableICO.methods.ended().call()).to.be.equal(
          false
        );

        expect(
          await this.ReversableICO.methods.TokenTrackerAddress().call()
        ).to.be.equal(TokenTrackerAddress);

        expect(
          await this.ReversableICO.methods.whitelistControllerAddress().call()
        ).to.be.equal(whitelistControllerAddress);
        expect(
          await this.ReversableICO.methods.TeamWalletAddress().call()
        ).to.be.equal(TeamWalletAddress);

        expect(await this.ReversableICO.methods.EndBlock().call()).to.be.equal(
          EndBlock.toString()
        );
      });
    });
  });
});
