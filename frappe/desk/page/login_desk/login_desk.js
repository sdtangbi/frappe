frappe.pages['login-desk'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Wel Come',
		single_column: true
	});

	let user_profile = new UserProfile(wrapper);
	$(wrapper).bind('show', ()=> {
		user_profile.show();
	});
}

class UserProfile {

}

