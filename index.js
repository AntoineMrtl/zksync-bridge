const zksync = require("zksync-web3");
const { ethers } = require("ethers");
const Web3 = require('web3');
const path = require("path");
const fs = require("fs");
const {Signale} = require('signale-logger');
const prompts = require('prompts');

let interval;

const error = new Signale({interactive: false, scope: 'Bridging'});
const note = new Signale({interactive: false, scope: 'Bridging'});
const interactive = new Signale({interactive: true, scope: 'Bridging'});

var main = async function() {

  const questions = [
      {
        type: 'select',
        name: 'value',
        message: 'Choose an action',
        choices: [
          { title: 'Bridge funds', description: 'Make sure you have filled in "privates_keys" in config.json and saved ', value: 'Bridge' },
          { title: 'Terminate', value: 'Terminate'},
        ],
        initial: 1
      }
    ];

    const answer = await prompts(questions);

    if (answer.value == 'Bridge') {
      startBridging();
    }
    else {
      die();
    }
};

function die() {
  return process.exit(1);
}

function cleanup() {
    clearInterval(interval);
}


// retreive config params
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath, "utf8"));

var private_keys = config.PRIVATE_KEYS;
var percentages;
if (config.CUSTOM_PERCENTAGES == false) {
  percentages = Array(private_keys.length).fill(1)
} else {
  percentages = config.PERCENTAGES_PER_ADDRESS;
}

// init providers
var zkSyncProvider = new zksync.Provider(config.ZKSYNC_PROVIDER);
var ethereumProvider = new ethers.providers.JsonRpcProvider(config.L1_PROVIDER);

// bridge eth main func
var bridgeETH = async function(id, private_key, percentage_to_bridge) {

  const wallet = new zksync.Wallet(private_key, zkSyncProvider, ethereumProvider);

  let gasfees = config.GAS_LIMIT;

  let gasprice = await ethereumProvider.getGasPrice() * config.GAS_SLIPPAGE;
  let totalEthFees = (gasprice * gasfees) / 1e18;
  let totalToTransfer = Math.floor((await wallet.getBalanceL1() * percentage_to_bridge - (gasprice * gasfees)))
  console.log((await wallet.getBalanceL1()).toString())
  console.log(totalToTransfer)

  if (totalToTransfer < 0) {
    console.log(totalToTransfer)
    error.error("Invalid eth amount to bridge (not enough to pay fees) - please make sure PERCENTAGES_PER_ADDRESS is 1 or CUSTOM_PERCENTAGES is false")
  }

  note.note("Gas price (in gwei) used for the bridge number " + id + " : " + gasprice / 1e9)
  note.note("Total eth fees : " + totalEthFees.toString())
  note.note("Total eth bridging : " + (totalToTransfer / 1e18).toString())

  setTimeout(() => { console.log("A") }, 150000);

  // bridge eth
  const ethDepositHandle = await wallet.deposit({
    token: zksync.utils.ETH_ADDRESS,
    amount: totalToTransfer.toString(),
  });


  interactive.await('[%d/4] - Sending tx on layer 1', 1);

  // wait L1 confirmation
  await ethDepositHandle.waitL1Commit();
  interactive.success('[%d/4] - Tx successfully included on layer 1', 2);
  setTimeout(() => {  }, 1500);

  interactive.await('[%d/4] - Sending tx on layer 2', 3);

  // wait L2 confirmation
  let tx = await ethDepositHandle.wait();
  interactive.success('[%d/4] - Tx successfully included on layer 1', 4);
  setTimeout(() => {  }, 1500);

  interactive.success("Successfully bridged " + (totalToTransfer.toString() / 10e18).toString() + " eth to L2 | ( l1 tx hash : " + tx.hash + " | l2 tx hash : " + ethDepositHandle.hash.toString() + " )");

  main();
}

var startBridging = async function() {
  cleanup();

  // reload parameters
  configPath = path.join(__dirname, "config.json");
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  private_keys = config.PRIVATE_KEYS;
  if (config.CUSTOM_PERCENTAGES == false) {
    percentages = Array(private_keys.length).fill(1)
  } else {
    percentages = config.PERCENTAGES_PER_ADDRESS;
  }
  
  zkSyncProvider = new zksync.Provider(config.ZKSYNC_PROVIDER);
  ethereumProvider = new ethers.providers.JsonRpcProvider(config.L1_PROVIDER);


  // main
  for (let i = 0; i < private_keys.length; i++) {
    await bridgeETH(i, private_keys[i], percentages[i])
  }
}

main();