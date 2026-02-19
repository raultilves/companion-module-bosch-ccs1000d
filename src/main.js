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
		this.sid = null // session id for authentication

		this.seats = [] // all mics
		this.speakers = [] // active mics

		this.mainSpeaker = {} // the only speaker or the speaker with priority
		this.lastMainSpeaker = null // ID of last speaker to track changes for variable updates
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

			// If the API returns a session id, store it and set a Cookie header for subsequent requests
			if (response && response.data && response.data.sid) {
				this.log('info', 'Bosch CCS 1000 D login successful')
				this.isLoggedIn = true
				this.sid = response.data.sid
				axios.defaults.headers.common['Cookie'] = `sid=${this.sid}`
				this.log('info', 'SID Cookie set successfully')
			}
			
		} catch (error) {
			this.log('error', 'Login failed: ' + error.message)
		}
	}

	async startPolling() { // Continuously poll for speaker updates and check login status
		this.pollingInterval = setInterval(async () => {
			if (!this.isLoggedIn) {
				await this.logIn()
				return
			}

			await this.getSpeakers()
			
		}, this.config.pollInterval || 250)
	}

	async getSpeakers() { // Fetch current active speakers from the API and update variables
		try {
			const response = await axios.get(`http://${this.config.server_ip}/api/speakers`)
				
			// Handle unauthorized response (e.g., session expired)
			if (response.status === 401) {
				this.log('error', 'Unauthorized. Check your credentials.')
				this.isLoggedIn = false
				return
			}
			if (response.data) {
				if (response.data.length > 0) { // If there are active speakers
					this.speakers = response.data

					// Find the speaker with priority (prio === true) or default to the first one if none have priority
					this.mainSpeaker = this.speakers.find(s => s.prio === true) || this.speakers[0]
					
					// Check if the main speaker has changed since the last poll to avoid unnecessary variable updates
					if (this.lastMainSpeaker !== this.mainSpeaker.id) {
						this.lastMainSpeaker = this.mainSpeaker.id
						this.setVariableValues({
							active_mic: this.mainSpeaker.id // Update variable with the ID of the active microphone
						})
					}

					this.log('info', `Active speakers: ${this.speakers.map(s => s.name).join(', ')}`)
					this.log('info', `Main speaker: ${this.mainSpeaker.name}`)
				} else { // If no active speakers, clear the variable and reset main speaker
					this.speakers = []

					if (this.lastMainSpeaker !== null) { // Only update variable if there was a previous speaker to avoid unnecessary updates
						this.lastMainSpeaker = null
						this.setVariableValues({
							active_mic: 0 // Clear variable when no active speakers. 0 Means no active microphone
						})
					}
					this.log('info', 'No active speakers')
				}
				this.updateFeedbacks()
				this.updateVariableDefinitions()
			}
		} catch (error) {
			this.log('error', 'Polling failed: ' + error.message)
			this.isLoggedIn = false // Force re-login on next poll
		}
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
