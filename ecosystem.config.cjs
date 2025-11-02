module.exports = {
  apps: [{
    name: "heatseeker",
    script: "server/index.mjs",
    env: {
      FINNHUB_API_KEY: "d4351ipr01qvk0ja7tugd4351ipr01qvk0ja7tv0",
      NODE_ENV: "production"
    }
  }]
}
