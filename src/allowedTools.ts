export default  {
    clickup: [
        "CLICKUP_GET_SPACES",
        "CLICKUP_SEARCH_TASKS", 
        "CLICKUP_UPDATE_TASK",
        "CLICKUP_GET_LIST",
        "CLICKUP_GET_TASK_IN_LIST",
        "CLICKUP_CREATE_TASK"
    ],

    general: ["CALL_API_REQUEST"],

    gmail: [
        "GMAIL_GET_EMAIL_BY_ID",
        "GMAIL_SEARCH_FOR_EMAIL",
        "GMAIL_CREATE_DRAFT"
    ],

    googleCalendar: [
        "GOOGLE_CALENDAR_GET_EVENT_BY_ID",
        "GOOGLE_CALENDAR_GET_CONTACTS", 
        "GOOGLECALENDAR_LIST_EVENTS_IN_PRIMARY_CALENDAR"
    ],

    googleads: [
        "*"
    ],

    hubspot: [
        "HUBSPOT_GET_RECORDS_COMPANIES",
        "HUBSPOT_GET_RECORDS_CONTACTS",
        "HUBSPOT_GET_RECORDS_DEALS",
        "HUBSPOT_GET_RECORDS_ENGAGEMENTS",
        "HUBSPOT_GET_RECORDS_ANY",
        "HUBSPOT_GET_RECORD_BY_ID_COMPANIES",
        "HUBSPOT_GET_RECORD_BY_ID_CONTACTS",
        "HUBSPOT_GET_RECORD_BY_ID_DEALS",
        "HUBSPOT_GET_RECORD_BY_ID_ENGAGEMENTS",
        "HUBSPOT_GET_RECORD_BY_ID_ANY",
        "HUBSPOT_SEARCH_RECORDS_COMPANIES",
        "HUBSPOT_SEARCH_RECORDS_CONTACTS",
        "HUBSPOT_SEARCH_RECORDS_DEALS",
        "HUBSPOT_SEARCH_RECORDS_ENGAGEMENTS",
        "HUBSPOT_SEARCH_RECORDS_ANY",
        "HUBSPOT_GET_CONTACTS_BY_LIST_ID",
        "HUBSPOT_DESCRIBE_ACTION_SCHEMA"
    ],
    outlook: [
        "OUTLOOK_GET_EVENTS",
        "OUTLOOK_GET_MESSAGES",
        "OUTLOOK_GET_EVENT_BY_ID"
    ],

    slack: [
        "SLACK_LIST_MEMBERS",
        "SLACK_LIST_CHANNELS",
        "SLACK_GET_USER_BY_EMAIL",
        "SLACK_SEARCH_MESSAGES",
        "SLACK_GET_USERS_BY_NAME"
    ],

    facebookAds: [
        "*"
    ],

    microsoftTeams: [
        "TEAMS_GET_USER_BY_EMAIL",
        "TEAMS_JOINED_TEAM_LIST",
        "TEAMS_CHANNEL_LIST",
        "TEAMS_MEMBER_LIST",
        "MICROSOFTTEAMS_LIST_MESSAGES_IN_A_CHANNEL"
    ],

    asana: [
        "ASANA_GET_PROJECTS",
        "ASANA_GET_PROJECT_BY_ID",
        "ASANA_GET_TASKS",
        "ASANA_GET_TASK_BY_ID",
        "ASANA_GET_TEAMS",
        "ASANA_GET_WORKSPACES",
        "ASANA_GET_USERS_IN_A_WORKSPACE"
    ],
    "monday.com": [
        "MONDAY_GET_ITEM_BY_ID_WITH_NEW_API_VERSION",
        "MONDAY_GET_ITEM_BY_EXTERNAL_ID_WITH_NEW_API_VERSION",
        "MONDAY_SEARCH_ITEMS_WITH_NEW_API_VERSION",
        "MONDAY_SEARCH_USERS"
    ],
    pipedrive: ["*"],
    linkedin: ["*"],
    googlesheets: ["*"],
    googledocs: ["*"],
    notion: ["*"],
    "custom.workamajig": ["*"]
}