import frappe
from datetime import datetime
from frappe.utils import today, time_diff_in_hours, date_diff, now, nowdate, flt

@frappe.whitelist()
def get_employee_info(user=None):
	if not user: user = frappe.session.user
	FMT = '%H:%M:%S'
	data = []
	flag = 0
	office_out_flag = 0
	date = datetime.strptime(str(nowdate()), "%Y-%m-%d")
	t = datetime.now().time().strftime(FMT)
	time = datetime.strptime(str(t),FMT)
	emp = frappe.db.sql("""
				select e.name as employee, e.employee_name, e.department,
    			ifnull((select b.shift_type from `tabAssign Shift` b, `tabShift Details` sd, `tabShift Type` st where sd.parent = b.name and sd.employee = e.employee and b.shift_type = st.name and '{0}' between st.start_time and '{1}' between b.from_date and b.to_date and st.end_time and sd.{2} = 1),e.default_shift) as shift_type,
				e.division, e.section, e.designation
				from `tabEmployee` e
				where e.user_id = "{3}"
	""".format(time, date, str(date.day), user), as_dict=True)
	actual_start_time = frappe.db.get_value("Shift Type", emp[0].shift_type, "start_time")
	actual_end_time = frappe.db.get_value("Shift Type", emp[0].shift_type, "end_time")
	tdelta = time - datetime.strptime(str(actual_start_time), FMT)
	time_difference = (tdelta.seconds/60/60)
 
	if time > datetime.strptime(str(actual_start_time), FMT):
		flag = 1
	if time < datetime.strptime(str(actual_end_time), FMT):
		office_out_flag = 1

	data.append({"employee": emp[0].employee, "employee_name": emp[0].employee_name, "shift_type": emp[0].shift_type, "time":time, "time_difference": time_difference, "actual_start_time":actual_start_time, "flag": flag, "oo_flag":office_out_flag})

	return data if data else data

@frappe.whitelist()
def make_employee_checkin(employee, employee_name, shift_type, time, time_difference, reason=None, checkin_type = None):
	# frappe.throw(checkin_type)
	if checkin_type != "":
		ct = str(checkin_type).split(" ")
		doc = frappe.new_doc("Employee Checkin")
		doc.employee = employee
		doc.emplyoee_name = frappe.db.get_value("Employee", employee, "employee_name")
		doc.log_type = ct[1]
		doc.type = ct[0]
		doc.shift = shift_type
		doc.date = datetime.strptime(str(nowdate()), "%Y-%m-%d")
		doc.time_difference = flt(time_difference, 2)
		if reason != None:
			doc.reason = reason
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.new_doc("Employee Checkin")
		doc.employee = employee
		doc.emplyoee_name = frappe.db.get_value("Employee", employee, "employee_name")
		doc.log_type = "IN"
		doc.type = "Office"
		doc.shift = shift_type
		doc.date = datetime.strptime(str(nowdate()), "%Y-%m-%d")
		doc.time_difference = flt(time_difference, 2)
		if reason != None:
			doc.reason = reason
		doc.save(ignore_permissions=True)

@frappe.whitelist()
def get_employee_checkin_info(user=None):
	if not user: user = frappe.session.user
	# data = []
	date = datetime.strptime(str(nowdate()), "%Y-%m-%d")
	# FMT = '%H'
	# t = datetime.now().time().strftime(FMT)
	# cur_time = datetime.strptime(str(t),FMT)
	# frappe.msgprint(str(cur_time).split(" ")[1])
	data = frappe.db.sql("""
				select ec.type,ec.log_type,ec.date as att_date,ec.time as att_time
				from `tabEmployee Checkin` ec
				where ec.date = "{}" and ec.owner = "{}" order by creation desc limit 1
	""".format(date, user), as_dict=True)
	if data:
		checkin_type = data[0].type+" "+data[0].log_type
	else:
		checkin_type = " "

	# data.append({"checkin_type": checkin_type,  "cur_time": str(cur_time).split(" ")[1]})

	return checkin_type

@frappe.whitelist()
def get_checkin_info(user):
	data = []
	office_in = "00:00:00"
	lunch_out = "00:00:00"
	lunch_in = "00:00:00"
	office_out = "00:00:00"
	cur_date = datetime.strptime(str(nowdate()), "%Y-%m-%d")
	# frappe.msgprint(str(cur_date))
	checkin_data = frappe.db.sql("""
				select ec.type,ec.log_type,ec.date as att_date,time_format(ec.time, "%H:%i %p") as att_time
				from `tabEmployee Checkin` ec
				where ec.date = "{}" and ec.owner = "{}"
	""".format(cur_date, user), as_dict=True)
	if checkin_data:
		for a in checkin_data:
			if a.type == "Office" and a.log_type == "IN":
				office_in = a.att_time
			elif a.type == "Lunch" and a.log_type == "OUT":
				lunch_out = a.att_time
			elif a.type == "Lunch"  and a.log_type == "IN":
				lunch_in = a.att_time
			elif a.type == "Office" and a.log_type == "OUT":
				office_out =a.att_time
	data.append({"office_in": office_in, "lunch_out": lunch_out, "lunch_in": lunch_in, "office_out": office_out, "date": str(cur_date).split(" ")[0]})
	return data

@frappe.whitelist()
def get_energy_points_heatmap_data(user, date):
	return dict(frappe.db.sql("""select unix_timestamp(date(creation)), sum(points)
		from `tabEnergy Point Log`
		where
			date(creation) > subdate('{date}', interval 1 year) and
			date(creation) < subdate('{date}', interval -1 year) and
			user = '{user}' and
			type != 'Review'
		group by date(creation)
		order by creation asc""".format(user = user, date = date)))

@frappe.whitelist()
def get_energy_points_percentage_chart_data(user, field):
	result = frappe.db.get_all('Energy Point Log',
		filters = {'user': user, 'type': ['!=', 'Review']},
		group_by = field,
		order_by = field,
		fields = [field, 'ABS(sum(points)) as points'],
		as_list = True)

	return {
		"labels": [r[0] for r in result if r[0] != None],
		"datasets": [{
			"values": [r[1] for r in result]
		}]
	}

@frappe.whitelist()
def update_profile_info(profile_info):
	profile_info = frappe.parse_json(profile_info)
	keys = ['location', 'interest', 'user_image', 'bio']

	for key in keys:
		if key not in profile_info:
			profile_info[key] = None

	user = frappe.get_doc('User', frappe.session.user)
	user.update(profile_info)
	user.save()
	return user

@frappe.whitelist()
def get_energy_points_list(start, limit, user):
	return frappe.db.get_list('Energy Point Log',
		filters = {'user': user, 'type': ['!=', 'Review']},
		fields = ['name','user', 'points', 'reference_doctype', 'reference_name', 'reason',
			'type', 'seen', 'rule', 'owner', 'creation', 'revert_of'],
		start = start,
		limit = limit,
		order_by = 'creation desc')
