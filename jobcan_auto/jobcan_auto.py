# 下記コマンドを実行します
# pip install selenium==3.141.0
# pip install jpholiday

from selenium import webdriver
from time import sleep
from selenium.webdriver.support.ui import Select

import jpholiday
import datetime

import calendar

class jobcan_auto:
    # 設定
    driver = webdriver.Chrome('./chromedriver')
    user_name = 'ユーザーのメールアドレス'
    user_pw = 'ユーザーのパスワード'
    year = 2022
    month = 10
    start_time = '10:00' # 始業時刻
    end_time = '19:00' # 終業時刻
    rest_time = '01:00' # 休憩時間

    # インプット取得
    def inputTime(self):
        bizDayArr = self.bizDayArray()
        start_inputs = self.driver.find_elements_by_css_selector('#editable_start > input')
        end_inputs = self.driver.find_elements_by_css_selector('#editable_end > input')
        rest_inputs = self.driver.find_elements_by_css_selector('#editable_rest > input')
        for i, isBiz in enumerate(bizDayArr):
            if isBiz == 0:
                continue

            # 出勤時刻要素
            start_inputs[i].send_keys('10:00')
            # 退勤時刻要素
            end_inputs[i].send_keys('19:00')
            # 休憩時間要素
            rest_inputs[i].send_keys('01:00')
            
    def bizDayArray(self):
        bizDayArr = []
        monthDays = calendar.monthrange(self.year, self.month)[1]
        day = 1
        while day <= monthDays:
            Date = datetime.date(self.year, self.month, day)
            if Date.weekday() >= 5 or jpholiday.is_holiday(Date):
                bizDayArr.append(0)
            else:
                bizDayArr.append(1)

            day += 1

        return bizDayArr

    def clickSubmitButtons(self):
        submitButtons = self.driver.find_elements_by_xpath('//div[text()="申請"]')
        for submitButton in submitButtons:
            self.driver.execute_script('arguments[0].click();', submitButton)

    def main(self):
        self.driver.get('https://id.jobcan.jp/users/sign_in?app_key=atd')
        email_input = self.driver.find_element_by_id('user_email')
        pw_input = self.driver.find_element_by_id('user_password')
        login_button = self.driver.find_element_by_id('login_button')
        email_input.send_keys(self.user_name)
        pw_input.send_keys(self.user_pw)
        login_button.submit()

        # 勤怠編集画面遷移
        self.driver.get('https://ssl.jobcan.jp/employee/attendance/edit')
        year_select = Select(self.driver.find_element_by_name('year'))
        year_select.select_by_value(str(self.year))
        month_select = Select(self.driver.find_element_by_name('month'))
        month_select.select_by_value(str(self.month))

        self.inputTime()
        self.clickSubmitButtons()

instance = jobcan_auto()
instance.main()
