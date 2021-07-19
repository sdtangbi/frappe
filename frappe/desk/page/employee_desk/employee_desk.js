frappe.provide('frappe.energy_points');

frappe.pages['employee-desk'].on_page_load = function(wrapper) {

	frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Employee Desk'),
	});

	let user_profile = new UserProfile(wrapper);
	$(wrapper).bind('show', ()=> {
		user_profile.show();
	});
};

class UserProfile {

	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = wrapper.page;
		this.sidebar = this.wrapper.find('.layout-side-section');
		this.main_section = this.wrapper.find('.layout-main-section');
		// this.leaves_detail_section = this.wrapper.find('.layout-leaves-detail-section');
	}

	show() {
		let route = frappe.get_route();
		this.user_id = route[1] || frappe.session.user;

		//validate if user
		if (route.length > 1) {
			frappe.db.exists('User', this.user_id).then( exists => {
				if (exists) {
					this.make_user_profile();
				} else {
					frappe.msgprint(__('User does not exist'));
				}
			});
		} else {
			this.user_id = frappe.session.user;
			this.make_user_profile();
		}
	}

	make_user_profile() {
		frappe.set_route('employee-desk', this.user_id);
		this.user = frappe.user_info(this.user_id);
		this.page.set_title(this.user.fullname);
		this.setup_transaction_link();
		this.main_section.empty().append(frappe.render_template('employee_desk'));
		// this.energy_points = 0;
		// this.review_points = 0;
		// this.rank = 0;
		// this.month_rank = 0;
		this.render_user_details();
		this.checkin_info();
		this.render_heatmap();
		this.render_line_chart();
		this.render_percentage_chart('type', 'Type Distribution');
		this.create_percentage_chart_filters();
		this.setup_show_more_activity();
		this.render_user_activity();
		this.setup_punching_button();
		// this.setup_leaves_detail();
	}

	setup_transaction_link() {
		this.$user_search_button = this.page.set_secondary_action('Transactions Link', () => {
			frappe.set_route('')
		});
	}

	// setup_leaves_detail() {
	// 	let $leaves_detail = this.wrapper.find('.leaves-detail');
	// }

	render_heatmap() {
		this.heatmap = new frappe.Chart('.performance-heatmap', {
			type: 'heatmap',
			countLabel: 'Energy Points',
			data: {},
			discreteDomains: 0,
		});
		// this.update_heatmap_data();
		this.create_heatmap_chart_filters();
	}

	update_heatmap_data(date_from) {
		frappe.xcall('frappe.desk.page.employee_desk.employee_desk.get_energy_points_heatmap_data', {
			user: this.user_id,
			date: date_from || frappe.datetime.year_start(),
		}).then((r) => {
			this.heatmap.update( {dataPoints: r} );
		});
	}

	get_years_since_creation() {
		//Get years since user account created
		this.user_creation = frappe.boot.user.creation;
		let creation_year = this.get_year(this.user_creation);
		let current_year = this.get_year(frappe.datetime.now_date());
		let years_list = [];
		for (var year = current_year; year >= creation_year; year--) {
			years_list.push(year);
		}
		return years_list;
	}

	get_year(date_str) {
		return date_str.substring(0, date_str.indexOf('-'));
	}

	render_line_chart() {
		this.line_chart_filters = {'user': this.user_id};
		this.line_chart_config = {
			timespan: 'Last Month',
			time_interval: 'Daily',
			type: 'Line',
			value_based_on: 'points',
			chart_type: 'Sum',
			document_type: 'Energy Point Log',
			name: 'Energy Points',
			width: 'half',
			based_on: 'creation'
		};

		this.line_chart = new frappe.Chart( '.performance-line-chart', {
			title: 'Energy Points',
			type: 'line',
			height: 200,
			data: {
				labels: [],
				datasets: [{}]
			},
			colors: ['purple'],
			axisOptions: {
				xIsSeries: 1
			}
		});
		this.update_line_chart_data();
		this.create_line_chart_filters();
	}

	update_line_chart_data() {
		this.line_chart_config.filters_json = JSON.stringify(this.line_chart_filters);

		frappe.xcall('frappe.desk.doctype.dashboard_chart.dashboard_chart.get', {
			chart: this.line_chart_config,
			no_cache: 1,
		}).then(chart => {
			this.line_chart.update(chart);
		});
	}

	render_percentage_chart(field, title) {
		frappe.xcall('frappe.desk.page.employee_desk.employee_desk.get_energy_points_percentage_chart_data', {
			user: this.user_id,
			field: field
		}).then(chart => {
			if (chart.labels.length) {
				this.percentage_chart = new frappe.Chart( '.performance-percentage-chart', {
					title: title,
					type: 'percentage',
					data: {
						labels: chart.labels,
						datasets: chart.datasets
					},
					truncateLegends: 1,
					barOptions: {
						height: 11,
						depth: 1
					},
					height: 160,
					maxSlices: 8,
					colors: ['#5e64ff', '#743ee2', '#ff5858', '#ffa00a', '#feef72', '#28a745', '#98d85b', '#a9a7ac'],
				});
			} else {
				this.wrapper.find('.percentage-chart-container').hide();
			}
		});
	}

	create_line_chart_filters() {
		let filters = [
			{
				label: 'All',
				options: ['All', 'Auto', 'Criticism', 'Appreciation', 'Revert'],
				action: (selected_item) => {
					if (selected_item === 'All') delete this.line_chart_filters.type;
					else this.line_chart_filters.type = selected_item;
					this.update_line_chart_data();
				}
			},
			{
				label: 'Last Month',
				options: ['Last Week', 'Last Month', 'Last Quarter'],
				action: (selected_item) => {
					this.line_chart_config.timespan = selected_item;
					this.update_line_chart_data();
				}
			},
			{
				label: 'Daily',
				options: ['Daily', 'Weekly', 'Monthly'],
				action: (selected_item) => {
					this.line_chart_config.time_interval = selected_item;
					this.update_line_chart_data();
				}
			},
		];
		this.render_chart_filters(filters, '.line-chart-container', 1);
	}

	create_percentage_chart_filters() {
		let filters = [
			{
				label: 'Type',
				options: ['Type', 'Reference Doctype', 'Rule'],
				fieldnames: ['type', 'reference_doctype', 'rule'],
				action: (selected_item, fieldname) => {
					let title = selected_item + ' Distribution';
					this.render_percentage_chart(fieldname, title);
				}
			},
		];
		this.render_chart_filters(filters, '.percentage-chart-container');
	}

	create_heatmap_chart_filters() {
		let filters = [
			{
				label: this.get_year(frappe.datetime.now_date()),
				options: this.get_years_since_creation(),
				action: (selected_item) => {
					this.update_heatmap_data(frappe.datetime.obj_to_str(selected_item));
				}
			},
		];
		this.render_chart_filters(filters, '.heatmap-container');
	}

	render_chart_filters(filters, container, append) {
		filters.forEach(filter => {
			let chart_filter_html = `<div class="chart-filter pull-right">
				<a class="dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
					<button class="btn btn-default btn-xs">
						<span class="filter-label">${filter.label}</span>
						<span class="caret"></span>
					</button>
				</a>`;
			let options_html;

			if (filter.fieldnames) {
				options_html = filter.options.map((option, i) =>
					`<li><a data-fieldname = "${filter.fieldnames[i]}">${option}</a></li>`).join('');
			} else {
				options_html = filter.options.map( option => `<li><a>${option}</a></li>`).join('');
			}

			let dropdown_html = chart_filter_html + `<ul class="dropdown-menu">${options_html}</ul></div>`;
			let $chart_filter = $(dropdown_html);

			if (append) {
				$chart_filter.prependTo(this.wrapper.find(container));
			} else $chart_filter.appendTo(this.wrapper.find(container));

			$chart_filter.find('.dropdown-menu').on('click', 'li a', (e) => {
				let $el = $(e.currentTarget);
				let fieldname;
				if ($el.attr('data-fieldname')) {
					fieldname = $el.attr('data-fieldname');
				}
				let selected_item = $el.text();
				$el.parents('.chart-filter').find('.filter-label').text(selected_item);
				filter.action(selected_item, fieldname);
			});
		});

	}

	//......Inserting Employee Checkin........
	make_employee_checkin(checkin_type){
		var ct = ""
		if(checkin_type == "Office IN"){
			ct = "Lunch OUT"
		}
		else if(checkin_type == "Lunch OUT"){
			ct = "Lunch IN"
		}
		else if(checkin_type == "Lunch IN"){
			ct = "Office OUT"
		}
		else{
			ct = "Office IN"
		}
		frappe.call({
			method:"frappe.desk.page.employee_desk.employee_desk.get_employee_info",
			args: ({"user":frappe.session.user}),
			callback: function(r){
				if(r.message){
					console.log(ct+" "+r.message[0].oo_flag);
					if((r.message[0].flag == 1 && ct == "Office IN") || (r.message[0].oo_flag == 1 && ct == "Office OUT")){
						let reason_dialog = new frappe.ui.Dialog({
							title: __('Late coming/Early Exit Reason'),
							fields: [
								{
									fieldtype: 'Small Text',
									fieldname: 'reason',
									label: 'Reason',
									reqd: 1,
								}
							],
							primary_action: values => {
								reason_dialog.disable_primary_action();
								frappe.xcall('frappe.desk.page.employee_desk.employee_desk.make_employee_checkin', {
									"employee": r.message[0].employee,
									"employee_name": r.message[0].employee_name,
									"shift_type": r.message[0].shift_type,
									"time": r.message[0].time,
									"time_difference": r.message[0].time_difference,
									reason: values['reason'],
									checkin_type: ct
								}).then(user => {
									reason_dialog.hide();
								}).finally(() => {
									reason_dialog.enable_primary_action();
								});
								let alert_dialog = new frappe.ui.Dialog({
									title: 'Your Record is updated successfully',
									primary_action: values => {
										alert_dialog.disable_primary_action();
										window.location.reload()
								},
								primary_action_label: 'OK'
								});
								alert_dialog.show();
						},
						primary_action_label: __('Save')
						});
						reason_dialog.show();
					}
					else{
						frappe.call({
							method: "frappe.desk.page.employee_desk.employee_desk.make_employee_checkin",
							args: {
									"employee": r.message[0].employee,
									"employee_name": r.message[0].employee_name,
									"shift_type": r.message[0].shift_type,
									"time": r.message[0].time,
									"time_difference": r.message[0].time_difference,
									checkin_type: ct
								},
							callback: function(r){
								let alert_dialog = new frappe.ui.Dialog({
									title: __('Your Record is updated successfully'),
									primary_action: values => {
										alert_dialog.disable_primary_action();
										window.location.reload()
								},
								primary_action_label: __('OK')
								});
								alert_dialog.show();
							}
						})
					}
				}
			}
		})
		// window.location.reload()
	}
	
	edit_profile() {
		let edit_profile_dialog = new frappe.ui.Dialog({
			title: __('Edit Profile'),
			fields: [
				{
					fieldtype: 'Attach Image',
					fieldname: 'user_image',
					label: 'Profile Image',
				},
				{
					fieldtype: 'Data',
					fieldname: 'interest',
					label: 'Interests',
				},
				{
					fieldtype: 'Column Break'
				},
				{
					fieldtype: 'Data',
					fieldname: 'location',
					label: 'Location',
				},
				{
					fieldtype: 'Section Break',
					fieldname: 'Interest',
				},
				{
					fieldtype: 'Small Text',
					fieldname: 'bio',
					label: 'Bio',
				}
			],
			primary_action: values => {
				edit_profile_dialog.disable_primary_action();
				frappe.xcall('frappe.desk.page.employee_desk.employee_desk.update_profile_info', {
					profile_info: values
				}).then(user => {
					user.image = user.user_image;
					this.user = Object.assign(values, user);
					edit_profile_dialog.hide();
					this.render_user_details();
				}).finally(() => {
					edit_profile_dialog.enable_primary_action();
				});
			},
			primary_action_label: __('Save')
		});

		edit_profile_dialog.set_values({
			user_image: this.user.image,
			location: this.user.location,
			interest: this.user.interest,
			bio: this.user.bio
		});
		edit_profile_dialog.show();
	}

	render_user_details() {
		this.sidebar.empty().append(frappe.render_template('employee_desk_sidebar', {
			user_image: frappe.avatar(this.user_id, 'avatar-frame', 'user_image', this.user.image),
			user_abbr: this.user.abbr,
			user_location: this.user.location,
			user_interest: this.user.interest,
			user_bio: this.user.bio,
		}));

		this.setup_user_profile_links();
	}

	// Sidebar Links
	setup_user_profile_links() {
		if (this.user_id !== frappe.session.user) {
			this.wrapper.find('.profile-links').hide();
		} else {
			this.wrapper.find('.edit-profile-link').on('click', () => {
				this.edit_profile();
			});

			this.wrapper.find('.transaction-link').on('click', () => {
				this.go_to_desk();
			});
		}
	}

	go_to_desk() {
		// frappe.set_route('Form', 'User', this.user_id);
		frappe.set_route('');
	}

	// Enabling and disabling employee checkin button
	setup_punching_button(){
		var checkin_type = ""
		frappe.call({
			method: "frappe.desk.page.employee_desk.employee_desk.get_employee_checkin_info",
			async: false,
			callback: function(r){
				// console.log(r);
				checkin_type = r.message
			}
		});
		if(frappe.session.user == 'Administrator'){
			this.wrapper.find('.office-in-button').hide();
			this.wrapper.find('.lunch-out-button').hide();
			this.wrapper.find('.lunch-in-button').hide();
			this.wrapper.find('.office-out-button').hide();
		}
		else if(checkin_type == "Office IN"){
			// console.log(r.message)				
			this.wrapper.find('.office-in-button').hide();
			this.wrapper.find('.lunch-in-button').hide();
			this.wrapper.find('.office-out-button').hide();
			this.wrapper.find('.lunch-out').on('click', () => {
				this.make_employee_checkin(checkin_type);
			});
		}
		else if(checkin_type == "Lunch OUT"){					
			this.wrapper.find('.office-in-button').hide();
			this.wrapper.find('.lunch-out-button').hide();
			this.wrapper.find('.office-out-button').hide();
			this.wrapper.find('.lunch-in').on('click', () => {
				this.make_employee_checkin(checkin_type);
			});
		}
		else if(checkin_type == "Lunch IN"){					
			this.wrapper.find('.office-in-button').hide();
			this.wrapper.find('.lunch-out-button').hide();
			this.wrapper.find('.lunch-in-button').hide();
			this.wrapper.find('.office-out').on('click', () => {
				this.make_employee_checkin(checkin_type);
			});
		}
		else if(checkin_type == "Office OUT"){
			this.wrapper.find('.office-in-button').hide();
			this.wrapper.find('.lunch-out-button').hide();
			this.wrapper.find('.lunch-in-button').hide();
			this.wrapper.find('.office-out-button').hide();
		}
		else {
			this.wrapper.find('.lunch-out-button').hide();
			this.wrapper.find('.lunch-in-button').hide();
			this.wrapper.find('.office-out-button').hide();
			this.wrapper.find('.office-in').on('click', () => {
				this.make_employee_checkin(checkin_type);
			});
		}
	}

	get_checkin_info() {
		return frappe.xcall('frappe.desk.page.employee_desk.employee_desk.get_checkin_info', {
			user: this.user_id,
		}).then(r => {
			this.office_in = r[0].office_in;
			this.lunch_out = r[0].lunch_out;
			this.lunch_in = r[0].lunch_in;
			this.office_out = r[0].office_out;
			this.date = r[0].date;
		});
	}

	checkin_info() {
		let $profile_details = this.wrapper.find('.profile-details');

		this.get_checkin_info().then(() => {
				let html = $(__(`<p style="color:#1f1e1e; font-size:16px; ">${__('Date: ')}<span class="rank">${this.date}</span></p>
					<p style="color:#8b0000; font-size:14px;">${__('Office In: ')}<span class="rank">${this.office_in}</span></p>
					<p style="color:#bba00a; font-size:14px;">${__('Lunch Out: ')}<span class="rank">${this.lunch_out}</span></p>
					<p style="color:#bba00a; font-size:14px;">${__('Lunch In: ')}<span class="rank">${this.lunch_in}</span></p>
					<p style="color:#036408; font-size:14px;">${__('Office Out: ')}<span class="rank">${this.office_out}</span></p>
				`, [this.date, this.office_in, this.lunch_out, this.lunch_in, this.office_out]));

				$profile_details.append(html);
		});
	}

	get_user_points() {
		return frappe.xcall(
			'frappe.social.doctype.energy_point_log.energy_point_log.get_user_energy_and_review_points',
			{
				user: this.user_id,
			}
		).then(r => {
			if (r[this.user_id]) {
				this.energy_points = r[this.user_id].energy_points;
				this.review_points = r[this.user_id].review_points;
			}
		});
	}

	render_user_activity() {
		this.$recent_activity_list = this.wrapper.find('.recent-activity-list');

		let get_recent_energy_points_html = (field) => {
			let message_html = frappe.energy_points.format_history_log(field);
			return `<p class="recent-activity-item text-muted"> ${message_html} </p>`;
		};

		frappe.xcall('frappe.desk.page.employee_desk.employee_desk.get_energy_points_list', {
			start: this.activity_start,
			limit: this.activity_end,
			user: this.user_id
		}).then(list => {
			if (list.length < 11) {
				let activity_html = `<span class="text-muted">${__('No More Activity')}</span>`;
				this.wrapper.find('.show-more-activity').html(activity_html);
			}
			let html = list.slice(0, 10).map(get_recent_energy_points_html).join('');
			this.$recent_activity_list.append(html);
		});
	}

	setup_show_more_activity() {
		//Show 10 items at a time
		this.activity_start = 0;
		this.activity_end = 11;
		this.wrapper.find('.show-more-activity').on('click', () => this.show_more_activity());
	}

	show_more_activity() {
		this.activity_start = this.activity_end;
		this.activity_end += 11;
		this.render_user_activity();
	}

}
