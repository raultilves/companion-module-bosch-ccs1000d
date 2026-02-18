const axios = require('axios')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')
const configFields = require('./config')

class BoschCCS1000DInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.isInitialized = false
		this.isLoggedIn = false
		this.seats = [] // all mics
		this.speakers = [] // active mics

	}

	async init(config) {
		// Validate config
		if (!config.server_ip) {
			this.log('error', '[CONFIG] Server IP is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Server IP is required')
			return
		}
		
		if (!config.username) {
			this.log('error', '[CONFIG] Username is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Username is required')
			return
		}

		this.config = config
		this.isInitialized = true

		this.updateStatus(InstanceStatus.Ok)
		this.startPolling() // Start polling for updates

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}

	async logIn() {
		const authPayload = {
			"override": true,
			"username": this.config.username,
			"password": this.config.password
		}
		
		try {
			const response = await axios.post(`http://${this.config.server_ip}/api/login`, authPayload)
			// Response handling
			this.isLoggedIn = true
			console.log('Login successful:', response.data)
		} catch (error) {
			this.log('error', 'Login failed: ' + error.message)
		}
	}

	async startPolling() {
		this.pollingInterval = setInterval(async () => {
			if (!this.isLoggedIn) {
				await this.logIn()
				return
			}

			try {
				const response = await axios.get(`http://${this.config.server_ip}/speakers`)
				// Process response and update variables/feedbacks
				console.log('Speakers:', response.data)
			} catch (error) {
				this.log('error', 'Polling failed: ' + error.message)
				this.isLoggedIn = false // Force re-login on next poll
			}
		}, this.config.pollInterval || 500)
	}

	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config

		// Validate config
		if (!config.server_ip) {
			this.log('error', '[CONFIG] Server IP is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Server IP is required')
			return
		}
		
		if (!config.username) {
			this.log('error', '[CONFIG] Username is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Username is required')
			return
		}

		// If we're already connected and the server details changed, reconnect
		if (this.isInitialized && 
			(this.lastServerIp !== config.server_ip || 
			this.lastUsername !== config.username || 
			this.lastPassword !== config.password)) {


			// TODO: Reinitialize connection
		}

		this.updateStatus(InstanceStatus.Ok)
	}

	// Return config fields for web config
	getConfigFields() {
		return configFields
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(BoschCCS1000DInstance, UpgradeScripts)
